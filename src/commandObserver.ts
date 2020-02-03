/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as Constants from './constants';
import { Telemetry } from './telemetry';
import { SqlOpsDataClient } from 'dataprotocol-client';

const msbuildOutputRegex = /^\s*([\d]>)?(((?<origin>([^\s].*))):|())\s*(?<subcategory>(()|([^:]*? )))(?<category>(error|warning))(\s*(?<code>[^: ]*))?\s*:\s*(?<text>.*)$/gm;
const lineRegex = /^(?<origin>([^\s].*))(\((?<linedetails>(\d+|\d+-\d+|\d+,\d+((-\d+)?)|\d+,\d+,\d+,\d+))\))$/;

export class CommandObserver {
	private _outputChannel: vscode.OutputChannel = null;
	private _diagnosticCollection: vscode.DiagnosticCollection = null;
	private _diagnosticMap = new Map<string, vscode.Diagnostic[]>();
	private _buildInProgress: boolean = false;
	private _outputFilePath: string;

	public get outputFilePath(): string {
		return this._outputFilePath;
	}

	public set outputFilePath(filePath: string) {
		this._outputFilePath = filePath;
	}

	public get buildInProgress(): boolean {
		return this._buildInProgress;
	}

	public set buildInProgress(inProg: boolean) {
		this._buildInProgress = inProg;
	}

	public resetOutputChannel() {
		this.setOutputChannel();
		this.clear();
		this._outputChannel.show(true);
	}

	public next(message:string) {
		this.setOutputChannel();
		this._outputChannel.appendLine(message);

		this.setDiagnosticCollection();
		try {
			this.parseDiagnostics(message);
			this._diagnosticMap.forEach((value, key) => {
				var uri = vscode.Uri.file(key);
				this._diagnosticCollection.set(uri, value);
			});
		} catch {
			Telemetry.sendTelemetryEvent('FailedToParseBuildMessage');
		}
	}

	public logToOutputChannel(message: string): void {
		this.setOutputChannel();
		this._outputChannel.appendLine(message);
	}

	private setOutputChannel()
	{
		if (!this._outputChannel) {
			this._outputChannel = vscode.window.createOutputChannel(Constants.projectOutputChannel);
		}
	}

	private setDiagnosticCollection()
	{
		if (!this._diagnosticCollection) {
			this._diagnosticCollection = vscode.languages.createDiagnosticCollection('build');
		}
	}

	private parseDiagnostics(output: string)
	{
		let match;
		while ((match = msbuildOutputRegex.exec(output)) !== null) {
			var file = match.groups.origin.trim();
			const lineMatch = lineRegex.exec(file);
			let lineDetails;
			if (lineMatch) {
				file = lineMatch['groups'].origin;
				lineDetails = lineMatch['groups'].linedetails;
			}
			let diag: vscode.Diagnostic = {
				code: match.groups.code,
				message: match.groups.text,
				range: this.getRange(lineDetails),
				severity: match.groups.category && match.groups.category === 'error' ?  vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning,
			};

			if (this._diagnosticMap.has(file)) {
				let diagArray = this._diagnosticMap.get(file);
				var index = diagArray.findIndex(d => d.message === match.groups.text);
				if (index < 0) {
					diagArray.push(diag);
				}
			} else {
				this._diagnosticMap.set(file, [diag]);
			}
		}

		msbuildOutputRegex.lastIndex = 0;
	}

	private getRange(lineDetails: string): vscode.Range {
		let lineNumber = 0;
		let column = 0;
		let endLineNumber = 0;
		let endColumn = 0;
		if (lineDetails) {
			let array = lineDetails.split(/[,-]/).map(p => Number(p));
			lineNumber = array[0]-1 || 0;
			column = array[1]-1 || 0;
			endLineNumber = array[2]-1 || 0;
			endColumn = array[3]-1 || 0;
		}
		return new vscode.Range(new vscode.Position(lineNumber, column), new vscode.Position(endLineNumber, endColumn));
	}

	public clear()
	{
		if (this._outputChannel) {
			this._outputChannel.clear();
		}
		if (this._diagnosticCollection) {
			this._diagnosticCollection.clear();
		}
		if (this._diagnosticMap) {
			this._diagnosticMap.clear();
		}
	}
}
