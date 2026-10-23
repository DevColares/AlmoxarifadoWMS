// src/firebase/config.ts
// Configuração do Firebase via variáveis de ambiente (.env)

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// ⚠️ CONFIGURE O ARQUIVO .env NA RAIZ DO PROJETO:
// Copie .env.example para .env e cole suas credenciais do Firebase Console
// https://console.firebase.google.com → seu projeto → Configurações → Web App
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            ?? "AIzaSyBIZ5JJKIsa7P-XAT-kpf-3qym7BnCbXd0",
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        ?? "almoxarifado-eae39.firebaseapp.com",
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         ?? "almoxarifado-eae39",
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     ?? "almoxarifado-eae39.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "1071930432326",
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             ?? "1:1071930432326:web:342e8f5758834a9037a347",
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID     ?? "G-MK0NBYD8L0",
};

// Avisa no console se ainda estão os valores placeholder
if (firebaseConfig.projectId === 'seu-projeto-id') {
  console.warn(
    '%c⚠️ WMS Firebase não configurado!%c\n' +
    'Copie o arquivo .env.example para .env e preencha com suas credenciais do Firebase Console.\n' +
    'Veja: https://console.firebase.google.com',
    'color: #f59e0b; font-size: 14px; font-weight: bold;',
    'color: inherit;'
  );
}

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export default app;
