# ZIP 필터·한 줄 일정표 OCR 운영 배포

사용자의 “배포 진행해” 요청으로 2026-09-23 13:13 KST 운영 배포를 완료했습니다.

- 운영: https://hanaparttime.isacc7224.workers.dev
- Worker 버전: `6daeafe0-5a3e-4884-a588-2b63957801f6`
- 소스 SHA-256: `02f3847341b7a50a28de7a0de437362580bd41987828857dd33ac8f18fa387b8`
- Git 기준 HEAD: `d3e56f0605bd50954ec8427dde77ea2c7c71d0da`. 해당 HEAD 이후 로컬 변경을 검증·배포했으며, 이번에는 Git 커밋·push를 수행하지 않았습니다.

반영 범위는 [사진이 있는 폴더만 ZIP 다운로드](ZIP_PHOTO_FOLDERS_2026-09-23.md), [한 건짜리 일정표 인식 수정](SINGLE_ROW_OCR_2026-09-23.md)입니다. 기존 운영 계정, D1, R2, 8GB 저장 한도를 유지했습니다. DB 마이그레이션은 추가 적용할 항목이 없었습니다.

## 검증 결과

- 배포 스크립트의 타입 검사, 린트 오류 0(기존 경고 15), 단위 101개, 통합 8개, 빌드 통과.
- 운영 로그인 및 비로그인 목록/ZIP 접근 차단 확인.
- 실제 운영 날짜 범위에서 현장 사진 1장은 유지되고 사진 없는 일정 폴더 7개는 제외됨을 확인. 옵션을 끈 목록과 파일명·파일 크기가 같으며, 반복 다운로드, 분할 목록/첫 ZIP, 사진 없는 단일 폴더 안내를 확인했습니다.
- 배포된 `workspace-DAoP_Vho.js`, `table-ocr-C7fiIWaI.js`의 SHA-256이 검증한 로컬 빌드와 일치합니다. 실제 제공 사진의 모든 필드 인식은 앞선 로컬 브라우저 검사에서 확인했고, 사진을 운영에 등록하지 않았습니다.
- 운영 자료는 일정 88개, 사진 자료 456개, 일정표 원본 13개, 도면 초안 1개로 직전 배포 기록과 같습니다. 이번 배포에서 기존 일정·사진을 수정하거나 삭제하지 않았습니다.
- Git 제외 로그: `.sites-runtime/release-zip-single-row-2026-09-23.log`, `.sites-runtime/deployments.jsonl`, `.sites-runtime/zip-ocr-release-after.json`.

로컬 QA는 기존 격리 저장소 `.wrangler/reliability-qa`를 유지하며, 운영 자료와 분리되어 있습니다.
