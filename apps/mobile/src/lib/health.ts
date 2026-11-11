import { Platform } from 'react-native';

import * as appleHealth from './apple-health';
import * as healthConnect from './health-connect';

/**
 * Watch and fitness-app imports, whichever health store this phone has: Apple Health on an
 * iPhone, Health Connect on Android. Both offer the same calls.
 */
const store = Platform.OS === 'ios' ? appleHealth : healthConnect;

export const healthStatus = store.healthStatus;
export const connectHealth = store.connectHealth;
export const syncHealth = store.syncHealth;
export const openHealthSettings = store.openHealthSettings;

/** The health store's name, for buttons and messages. */
export const HEALTH_STORE_NAME = Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect';

export type { HealthStatus, HealthSync, SeenWorkout, WorkoutOutcome } from './health-import';
