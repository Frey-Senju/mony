/**
 * Capacitor Mobile App Configuration (iOS & Android Wrapper) for Mony.
 *
 * Uses the live production PWA/Next.js URL or static bundle with native
 * Face ID / Biometrics, Push Notifications, StatusBar and SplashScreen support.
 * See `docs/MOBILE_APP_STORE_GUIDE.md` for build & App Store / Play Store steps.
 */

const config = {
  appId: 'br.com.mony.app',
  appName: 'Mony',
  webDir: 'out',
  server: {
    url: 'https://mony-kappa.vercel.app',
    cleartext: false,
    androidScheme: 'https',
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    backgroundColor: '#050914',
  },
  android: {
    backgroundColor: '#050914',
    allowMixedContent: false,
    captureInput: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#050914',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#050914',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
}

export default config
