import Constants, { ExecutionEnvironment } from 'expo-constants';

/** Running inside the Expo Go app, which can't do background location or remote push. */
export const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
