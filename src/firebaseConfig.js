// src/firebaseConfig.js
import { initializeApp } from "firebase/app"
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore"

const firebaseConfig = {
  apiKey: "AIzaSyAW_q8p4sGNdeBKuLms3BmMbC-amFhrpFU",
  authDomain: "eunhakinder-note.firebaseapp.com",
  projectId: "eunhakinder-note",
  storageBucket: "eunhakinder-note.firebasestorage.app",
  messagingSenderId: "846026916791",
  appId: "1:846026916791:web:62598781494035ad30de32"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)

// 오프라인 캐시(여러 탭 열림 오류는 무시)
enableIndexedDbPersistence(db).catch(() => {})
