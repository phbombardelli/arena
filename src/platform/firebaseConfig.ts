/**
 * Projeto Firebase do Arena (B-36, B-78): "arena-croquis", separado do SAPH.
 *
 * Estes valores identificam o app para o Firebase e são públicos por
 * natureza: vão no código do navegador. O que protege os dados são as
 * regras de segurança do Firestore (firestore.rules), aplicadas no servidor.
 */
export const firebaseConfig = {
  "apiKey": "AIzaSyC3tvk-IW8PXGvYPFt6ujWWrR2oW_nBqjg",
  "authDomain": "arena-croquis.firebaseapp.com",
  "projectId": "arena-croquis",
  "storageBucket": "arena-croquis.firebasestorage.app",
  "messagingSenderId": "394456384443",
  "appId": "1:394456384443:web:8414f1a61bef0bf634fa9e"
} as const;
