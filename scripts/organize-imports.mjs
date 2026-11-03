import fs from 'node:fs';
import ts from 'typescript';
const source = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
const config = ts.parseJsonConfigFileContent(source.config, ts.sys, process.cwd());
const host = {
  getScriptFileNames: () => config.fileNames,
  getScriptVersion: () => '0',
  getScriptSnapshot: (file) =>
    ts.sys.fileExists(file) ? ts.ScriptSnapshot.fromString(ts.sys.readFile(file)) : undefined,
  getCurrentDirectory: () => process.cwd(),
  getCompilationSettings: () => config.options,
  getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  readDirectory: ts.sys.readDirectory,
};
const service = ts.createLanguageService(host);
for (const fileName of config.fileNames) {
  if (fileName.endsWith('.d.ts')) continue;
  const edits = service.organizeImports({ type: 'file', fileName }, {}, {});
  for (const edit of edits) {
    let text = fs.readFileSync(edit.fileName, 'utf8');
    for (const change of edit.textChanges.sort((a, b) => b.span.start - a.span.start))
      text =
        text.slice(0, change.span.start) +
        change.newText +
        text.slice(change.span.start + change.span.length);
    fs.writeFileSync(edit.fileName, text);
  }
}
