use crate::storage::{Result, err};
use std::{
    collections::HashMap,
    io::{Read, Result as IoResult},
    sync::{
        Mutex,
        atomic::{AtomicU64, Ordering},
    },
};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::watch;
#[derive(Default)]
pub struct Operations(pub Mutex<HashMap<String, watch::Sender<bool>>>);
pub struct Operation {
    pub id: String,
    app: AppHandle,
    cancel: watch::Receiver<bool>,
    processed: AtomicU64,
}
impl Operation {
    pub fn start(app: &AppHandle, id: Option<String>) -> Result<(Self, watch::Receiver<bool>)> {
        let id = id.unwrap_or_else(crate::media::new_id);
        if id.len() > 80 || !id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') {
            return Err("Некорректный ID операции".into());
        }
        let (sender, receiver) = watch::channel(false);
        let state = app.state::<Operations>();
        let mut jobs = state.0.lock().map_err(err)?;
        if jobs.contains_key(&id) {
            return Err("Операция уже выполняется".into());
        }
        jobs.insert(id.clone(), sender);
        Ok((
            Self {
                id,
                app: app.clone(),
                cancel: receiver.clone(),
                processed: AtomicU64::new(0),
            },
            receiver,
        ))
    }
    pub fn check(&self) -> Result<()> {
        if *self.cancel.borrow() {
            Err("Операция отменена".into())
        } else {
            Ok(())
        }
    }
    fn advance(&self, count: u64) {
        let before = self.processed.fetch_add(count, Ordering::Relaxed);
        let now = before + count;
        if before / 1048576 != now / 1048576 {
            self.progress(now, None);
        }
    }
    pub fn progress(&self, bytes: u64, total: Option<u64>) {
        let _ = self.app.emit(
            "atlas-operation",
            serde_json::json!({"id":self.id,"bytes":bytes,"total":total}),
        );
    }
}
impl Drop for Operation {
    fn drop(&mut self) {
        if let Ok(mut jobs) = self.app.state::<Operations>().0.lock() {
            jobs.remove(&self.id);
        }
    }
}
pub async fn cancelled(receiver: &mut watch::Receiver<bool>) {
    loop {
        if *receiver.borrow() {
            return;
        }
        if receiver.changed().await.is_err() {
            std::future::pending::<()>().await;
        }
    }
}
#[tauri::command]
pub fn cancel_operation(state: State<Operations>, id: String) -> Result<()> {
    if let Some(sender) = state.0.lock().map_err(err)?.get(&id) {
        let _ = sender.send(true);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test(flavor = "current_thread")]
    async fn cancellation_wakes_a_waiting_download_and_is_sticky() {
        let (sender, mut receiver) = watch::channel(false);
        let waiter = tokio::spawn(async move {
            cancelled(&mut receiver).await;
            receiver
        });
        sender.send(true).unwrap();
        let mut receiver = tokio::time::timeout(std::time::Duration::from_secs(1), waiter)
            .await
            .unwrap()
            .unwrap();
        tokio::time::timeout(
            std::time::Duration::from_millis(100),
            cancelled(&mut receiver),
        )
        .await
        .unwrap();
    }
}

pub struct ProgressReader<'a, R> {
    reader: R,
    operation: Option<&'a Operation>,
}
impl<'a, R: Read> ProgressReader<'a, R> {
    pub fn new(reader: R, operation: Option<&'a Operation>) -> Self {
        Self { reader, operation }
    }
}
impl<R: Read> Read for ProgressReader<'_, R> {
    fn read(&mut self, buffer: &mut [u8]) -> IoResult<usize> {
        if let Some(op) = self.operation {
            op.check().map_err(std::io::Error::other)?;
        }
        let n = self.reader.read(buffer)?;
        if let Some(op) = self.operation {
            op.advance(n as u64);
        }
        Ok(n)
    }
}
