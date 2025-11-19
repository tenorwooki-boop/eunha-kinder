# Eunha PWA Starter

React + Vite + vite-plugin-pwa로 구성된 최소 템플릿입니다.

## 로컬 실행
```bash
npm i
npm run dev
```
브라우저에서 `http://localhost:5173` 접속 후, 주소창에 **설치 아이콘**이 보이면 PWA 설치 가능합니다.

## 프로덕션 빌드 & 미리보기
```bash
npm run build
npm run preview
```

## Vercel 배포
1. 이 폴더를 깃 저장소에 푸시
2. [Vercel](https://vercel.com)에서 New Project → Import
3. Framework: **Vite**, Build Command: `npm run build`, Output: `dist`
4. 배포 후 앱에 접속 → 한 번 로딩되면 오프라인에서도 접근 가능

## iOS / Android 설치
- **iOS (Safari)**: 공유 버튼 → 홈 화면에 추가
- **Android (Chrome)**: 메뉴 → 앱 설치

## 참고
- `vite.config.js`에서 PWA 캐싱 전략 조정
- `/manifest.webmanifest` 아이콘 경로/이름 변경 가능
- 아이콘은 `/icons` 폴더에 있습니다.
