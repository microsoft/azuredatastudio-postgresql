/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as Constants from './constants';
import { CommandObserver } from './commandObserver';
import * as compareVersions from 'compare-versions';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();
const xml2js = require('xml2js');

const sdkName: string = "Microsoft.DataTools.Schema.Tasks.PostgreSql.Sdk";
const enum sdkReference {
	Attribute = 1,
	Element = 2
};

export type ProjectInformation = {
	path: string;
	sdkVersion: string;
	sdkReferenceType: sdkReference;
}

export async function checkProjectVersion(minRequiredSDK: string, maxRequiredSDK: string, projects: string[], commandObserver: CommandObserver) : Promise<Array<ProjectInformation>> {
	let unsupportedProjectsMap = new Array<ProjectInformation>();
	for (let project of projects) {
		let projectFileText = fs.readFileSync(project, 'utf8');
		let projectInfo = readXML(project, projectFileText, commandObserver);
		if (projectInfo) {
			if (!(compareVersions.compare(projectInfo.sdkVersion, minRequiredSDK, '>=') && compareVersions.compare(projectInfo.sdkVersion, maxRequiredSDK, '<='))) {
				unsupportedProjectsMap.push(projectInfo);
			}
		}
	}

	if (unsupportedProjectsMap.length > 0) {
		promptToUpdateVersion(unsupportedProjectsMap, maxRequiredSDK, commandObserver);
	}

	return Promise.resolve(unsupportedProjectsMap);
}

function readXML(project: string, fileText: string, commandObserver: CommandObserver): ProjectInformation {
	var parser = new xml2js.Parser();
	let version: string;
	let referenceType: sdkReference;
	parser.parseString(fileText, function(err, result) {
		if (result && result.Project && result.Project.$ && result.Project.$.Sdk) {
			referenceType = sdkReference.Attribute;
			let splitArray: string[] = result.Project.$.Sdk.split('/');
			if (splitArray.length === 2 && splitArray[0].trim().toUpperCase() === sdkName.toUpperCase()) {
				version = splitArray[1].trim();
			}
		}
		else if(result && result.Project && result.Project.sdkName
			&& result.Project.Sdk[0].$ && result.Project.Sdk[0].$.Name && result.Project.Sdk[0].$.Version) {
				referenceType = sdkReference.Element;
				if (result.Project.Sdk[0].$.Name.trim().toUpperCase() === sdkName.toUpperCase()) {
					version = result.Project.Sdk[0].$.Version.trim();
				}
		}
	});

	if (version) {
		return { path: project, sdkVersion: version, sdkReferenceType: referenceType };
	}
	return undefined;
}

function promptToUpdateVersion(unsupportedProjects: Array<ProjectInformation>, maxRequiredSDK: string, commandObserver: CommandObserver) {
	let msg = localize('extension.unsupportedPostgreSQLSdkMessage', 'There are some projects that use unsupported version of PostgreSQL SDK.');
	let installItem = localize('extension.updateProjectButtonText', 'Update Projects');
	vscode.window.showErrorMessage(msg, installItem)
	.then((item) => {
		if (item === installItem) {
			updateProjects(unsupportedProjects, maxRequiredSDK, commandObserver);
		}
	});
}

function updateProjects(unsupportedProjects: Array<ProjectInformation>, maxRequiredSDK: string, commandObserver: CommandObserver) {
	unsupportedProjects.forEach((project) => {
		let projectPath = project.path;
		let fileContent = fs.readFileSync(projectPath, 'utf8');
		commandObserver.logToOutputChannel(localize('extension.updatingSdkMessage', "Updating PostgreSQL SDK version for file {0}.", projectPath));
		try {
			fileContent = getUpdatedXML(fileContent, project.sdkReferenceType, maxRequiredSDK)
			fs.writeFile(project.path, fileContent, (err) => {
				if (err) {
					commandObserver.logToOutputChannel(localize('extension.updatingSdkErrorMessage', 'Error updating SDK version for file {0}.', projectPath));
				} else {
					commandObserver.logToOutputChannel(localize('extension.sdkUpdateCompleteMessage', 'Project file {0} has been updated.', projectPath));
				}
			});
		}
		catch (err) {
			commandObserver.logToOutputChannel(localize('extension.updatingSdkErrorMessage', 'Error updating SDK version for file {0}.', projectPath));
		}
	});
}

function getUpdatedXML(fileText: string, sdkReferenceType: sdkReference, maxRequiredSDK: string): string {
	var parser = new xml2js.Parser();
	let updatedText: string;
	parser.parseString(fileText, function(err, result) {
		if (sdkReferenceType === sdkReference.Attribute) {
			result.Project.$.Sdk = sdkName + '/' + maxRequiredSDK;
		}
		else {
			result.Project.Sdk[0].$.Version = maxRequiredSDK;
		}

		var builder = new xml2js.Builder({ headless: true });
		updatedText = builder.buildObject(result);
	});
	return updatedText;
}