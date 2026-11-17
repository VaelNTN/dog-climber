import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dogclimber.game',
  appName: 'Dog Climber',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  android: {
    backgroundColor: '#0b1120',
  },
};

export default config;
