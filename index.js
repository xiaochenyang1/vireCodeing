/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { platformBuildConfig } from './src/config/platformBuildConfig';
import { installPlatformRuntimeConfig } from './src/services/platformRuntimeConfig';

installPlatformRuntimeConfig(platformBuildConfig);

AppRegistry.registerComponent(appName, () => App);
