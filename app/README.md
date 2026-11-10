# app — Expo (React Native)

Uma só base de código para **web, Android e iOS**.

## Criar o projeto (Sprint 0)

Na raiz do repositório:

```bash
npx create-expo-app@latest app --template default
cd app
npx expo install react-dom react-native-web @expo/metro-runtime
npm install maplibre-gl @maplibre/maplibre-react-native
```

## Mapa por plataforma

O Expo escolhe o ficheiro certo automaticamente:

```
components/
  Map.web.tsx      → maplibre-gl (browser)
  Map.native.tsx   → @maplibre/maplibre-react-native (Android/iOS)
```

O resto da app (painéis, filtros, chamadas à API) é partilhado.

> Nota: `@maplibre/maplibre-react-native` usa código nativo, por isso no telemóvel precisas de um *development build* (`npx expo run:android` / `eas build`), não do Expo Go.

## Build web para o GitHub Pages

```bash
npx expo export --platform web   # gera app/dist/
```
