/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
import * as vscode from 'vscode';

const regex = /^(,)?(((?<origin>([^\s].*))\((?<linedetails>(\d+|\d+,\d+|\d+,\d+,\d+,\d+))\))|()):\s(?<subcategory>(()|([^:]*? )))(?<category>(error|warning))(\s*(?<code>[^: ]*))?\s*:\s(?<text>.*)$/gm;

export class CommandObserver {

    private _outputChannel: vscode.OutputChannel = null;
    private _diagnosticCollection: vscode.DiagnosticCollection = null;
    private _diagnosticMap = new Map<string, vscode.Diagnostic[]>();

    public constructor(outputChannel: vscode.OutputChannel) {
        this._outputChannel = outputChannel;
        this._diagnosticCollection = vscode.languages.createDiagnosticCollection('build');
    }

    public next(message:string) {
        this._outputChannel.show(true);
        this._outputChannel.appendLine(message);

        this.parseDiagnostics(message);
        this._diagnosticMap.forEach((value, key) => {
            var uri = vscode.Uri.file(key);
            this._diagnosticCollection.set(uri, value);
        });
    }

    private parseDiagnostics(output: string)
    {
        let match;
        while ((match = regex.exec(output)) !== null) {
            var file = match.groups.origin;
            let diag: vscode.Diagnostic = {
                code: match.groups.code,
                message: match.groups.text,
                range: this.getRange(match.groups.linedetails),
                severity: match.groups.category && match.groups.category === 'error' ?  vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning,
                source: 'dotnet'
            };

            if (this._diagnosticMap.has(file)) {
                this._diagnosticMap[file].push(diag);
            } else {
                this._diagnosticMap.set(file, [diag]);
            }
        }

        regex.lastIndex = 0;
    }

    private getRange(lineDetails: string): vscode.Range {
        let array = lineDetails.split(',').map(Number);
        var lineNumber = array[0]-1 || 0;
        var column = array[1]-1 || 0;
        var endLineNumber = array[2]-1 || 0;
        var endColumn = array[3]-1 || 0;

        return new vscode.Range(new vscode.Position(lineNumber, column), new vscode.Position(endLineNumber, endColumn));
    }

    public clear()
    {
        this._outputChannel.clear();
        this._diagnosticMap.clear();
        this._diagnosticCollection.clear();
    }
}