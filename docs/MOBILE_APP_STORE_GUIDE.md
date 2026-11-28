# Mony Mobile App Guide (iOS App Store & Google Play via Capacitor)

O Mony já está preparado como **PWA 2.0** (com Service Worker, Web Push RFC 8291 VAPID e `manifest.webmanifest`) e conta com `apps/web/capacitor.config.ts` pronto para empacotamento nativo em **iOS** e **Android** via Capacitor.

## 1. Instalação dos pacotes Capacitor (1 vez)
```bash
cd apps/web
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android @capacitor/push-notifications @capacitor/status-bar @capacitor/splash-screen
```

## 2. Gerar projetos nativos iOS & Android
```bash
npx cap add ios
npx cap add android
npx cap sync
```

## 3. Abrir nas IDEs nativas para assinatura e publicação
- **iOS (requer macOS + Xcode):** `npx cap open ios` → Configure Team/Signing (`br.com.mony.app`), ative *Push Notifications* & *Face ID Usage Description*, archive e envie para o TestFlight / App Store Connect.
- **Android (Windows/macOS/Linux + Android Studio):** `npx cap open android` → Gere o **Android App Bundle (.aab)** assinado e publique no Google Play Console.

## 4. Variáveis de Ambiente de Produção (`mony-api` na Vercel)
Para ativar todos os canais automáticos em produção:
- `CRON_SECRET`: segredo Bearer para o Cron Diário (`07:00 BRT` em `apps/api/vercel.json`)
- `RESEND_API_KEY` + `RESEND_FROM_EMAIL`: e-mails transacionais (Alertas Preço-Teto Valuer, Mony Review mensal, convites)
- `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_CLAIMS_EMAIL`: Web Push nativo
- `PLUGGY_CLIENT_ID` + `PLUGGY_CLIENT_SECRET`: Open Finance Brasil
- `SENTRY_DSN`: monitoramento de erros em tempo real
