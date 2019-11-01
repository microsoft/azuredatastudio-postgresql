/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as strings from './strings';
import * as Constants from './constants';
import { CommandObserver } from './CommandObserver';
import * as compareVersions from 'compare-versions';
const regex = /(?<="Microsoft.DataTools.Schema.Tasks.PostgreSql.Sdk\/)(.*?)(?=")/;

export async function checkProjectVersion(minRequiredSDK: string, maxRequiredSDK: string, projects: string[], commandObserver: CommandObserver) : Promise<string[]> {
	let unsupportedProjectsMap: string[] = [];
    for (let project of projects) {
        let projectFileText = fs.readFileSync(project, 'utf8');
            let sdkVersion;
            if ((sdkVersion = regex.exec(projectFileText)) !== null) {
				if (!(compareVersions.compare(sdkVersion[0], minRequiredSDK, '>=') && compareVersions.compare(sdkVersion[0], maxRequiredSDK, '<='))) {
                    unsupportedProjectsMap.push(project);
                }
            }
    }

    if (unsupportedProjectsMap.length > 0) {
		promptToUpdateVersion(unsupportedProjectsMap, maxRequiredSDK, commandObserver);
	}

	return Promise.resolve(unsupportedProjectsMap);
}

function promptToUpdateVersion(unsupportedProjects: string[], maxRequiredSDK: string, commandObserver: CommandObserver) {
    let msg = Constants.unsupportedPostgreSQLSdkMessage;
    let installItem = 'Update Projects';
    vscode.window
        .showErrorMessage(msg, installItem)
        .then(
            (item) => {
                if (item === installItem) {

                    UpdateProjects(unsupportedProjects, maxRequiredSDK, commandObserver);
                }
            }
        );
}

function UpdateProjects(unsupportedProjects: string[], maxRequiredSDK: string, commandObserver: CommandObserver) {
    unsupportedProjects.forEach(project => {
		let fileContent = fs.readFileSync(project, 'utf8');
		commandObserver.logToOutputChannel(strings.format(Constants.updatingSdkMessage, project));
        fileContent = fileContent.replace(regex, maxRequiredSDK);
        fs.writeFile(project, fileContent, (err) => {
            if (err) {
                commandObserver.logToOutputChannel(strings.format(Constants.updatingSdkErrorMessage, project));
            } else {
				commandObserver.logToOutputChannel(strings.format(Constants.sdkUpdateCompleteMessage, project));
			}
        });
    });
}
