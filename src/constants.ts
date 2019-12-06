/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

export const serviceName = localize('extension.serviceName', 'pgSQLToolsService');
export const providerId = localize('extension.providerId', 'PGSQL');
export const serviceCrashMessage = localize('extension.serviceCrashMessage', 'PG SQL Tools Service component exited unexpectedly. Please restart Azure Data Studio.');
export const serviceCrashButton = localize('extension.serviceCrashButton', 'View Known Issues');
export const serviceCrashLink = localize('extension.serviceCrashLink', 'https://github.com/microsoft/pgtoolsservice/issues?q=is%3Aopen+is%3Aissue+label%3Aknown-issues');
export const projectOutputChannel = localize('extension.projectOutputChannel', 'pgSQLProject');
export const templateDoesNotExistMessage = localize('extension.templateDoesNotExistMessage', 'No templates matched the input template name: pgproj.');
export const projectNameSpecialCharsErrorMessage = localize('extension.projectNameSpecialCharsErrorMessage', 'Project names cannot contain any of the following characters: /?:&\\*"<>|#%;');
export const projectNameInvalidErrorMessage = localize('extension.projectNameInvalidErrorMessage', 'Project names cannot be \'.\' or \'..\'');
export const projectNameInvalidCharErrorMessage = localize('extension.projectNameInvalidCharErrorMessage', 'Project names cannot contain \'..\'');
export const projectNameEmptyErrorMessage = localize('extension.projectNameEmptyErrorMessage', 'Project names cannot be empty');
export const buildCancelMessage = localize('extension.buildCancelMessage', 'Build has been cancelled');
export const buildProgressTitle = localize('extension.buildProgressTitle', 'Building projects');
export const unsupportedPostgreSQLSdkMessage = localize('extension.unsupportedPostgreSQLSdkMessage', 'There are some projects that use unsupported version of PostgreSQL SDK.');
export const existingBuildInProgressMessage = localize('extension.existingBuildInProgressMessage', 'There is a build already running, please cancel the build before starting a new one');
export const updateProjectButtonText = localize('extension.updateProjectButtonText', 'Update Projects');
export const dotNetCoreNotFoundMessage = localize('extension.dotNetCoreNotFoundMessage', 'The .NET Core SDK was not found.');
export const installDotNetCoreButtonText = localize('extension.installDotNetCoreButtonText', 'Install .NET Core SDK...');
