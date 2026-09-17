# Hanaparttime 독립 운영 배포

이 브랜치는 웹 화면, API, D1, R2를 본인 Cloudflare 계정에 직접 배포한다.
실행 중 ChatGPT Sites/Vercel/Supabase를 호출하지 않는다. OCR 엔진과 한국어·영어 모델도 같은 사이트에서 제공한다.

## 확인된 상태

- 독립 관리자 인증과 기존 기능을 로컬 D1/R2 통합 테스트로 검증했다.
- 실제 Cloudflare 계정 인증은 아직 완료되지 않았다.
- 원격 D1/R2 자원 생성, 원본 자료 복사, 공개 URL 검증은 아직 수행하지 않았다.
- 기존 운영 사이트는 변경하거나 삭제하지 않았다.

## 계정 연결 후 배포

1. Node.js 22.13 이상에서 기존 잠금 파일로 패키지를 설치한다.
2. `node node_modules/wrangler/bin/wrangler.js login`으로 본인 계정에 연결한다.
3. `node node_modules/wrangler/bin/wrangler.js d1 create hanaparttime-db --location apac`으로 데이터베이스를 만든다.
4. `node node_modules/wrangler/bin/wrangler.js r2 bucket create hanaparttime-photos --location apac`으로 비공개 사진 버킷을 만든다. 공개 버킷 접근은 켜지 않는다.
5. `cloudflare/deployment.example.json`을 `cloudflare/deployment.json`으로 복사하고 실제 계정 ID와 D1 ID를 넣는다. 이 파일은 Git에서 제외된다.
6. `npm run deploy:production`을 실행한다. 빌드, 타입 검사, 통합 테스트 후 DB 마이그레이션과 Workers 배포를 순서대로 수행한다. 로컬 검증만 하려면 `npm run deploy:production -- --check`를 사용한다.
7. 출력된 `https://hanaparttime.<계정 하위 도메인>.workers.dev`에서 `/account/setup`을 열고 생성된 관리 키로 공용 아이디/비밀번호를 설정한다. 관리 키는 `.deploy-secrets/production.json`에만 저장하며 일반 사용자에게 공유하지 않는다.
8. 실제 새 URL에서 로그아웃 상태 접근 차단, 두 기기의 공용 로그인, 5MB 이상의 사진 원본 업로드·다운로드, ZIP 및 일일보고를 확인한다. 관리자 암호 변경 시 기존 세션도 폐기된다.

`hanaparttime.com` 같은 도메인은 별도 소유권과 구매가 필요하다. 위 workers.dev 주소는 계정 하위 도메인이 결정된 후 확정된다.

## 기존 자료 이전

먼저 기존 사이트에서 전체 ZIP을 내려받고 `/api/library`의 일정·비고·진행 상태와 각 폴더의 사진 목록을 인증된 세션으로 백업한다. 사진만 ZIP에 담겨 있으므로 ZIP만으로 비고와 상태를 복원했다고 간주하면 안 된다.

대상 DB에는 일정 ID, 지역·날짜, 번지·호수, 연락처, 일정 메모, 비고, 상태를 함께 옮긴다. R2 원본을 복사하고 원본의 바이트 수와 SHA-256을 대조한 뒤 사진 메타데이터를 기록한다. 일정표 원본도 전체 ZIP에서 별도로 복원한다. 원본 파일 이름이 같아도 사진 ID는 유지하고, 대상 기존 데이터를 덮어쓰지 않는다.

기존 로그인 세션과 로그인 시도 기록은 이전하지 않는다. 데이터 소유자 값은 새 `site_account.owner`와 일치하도록 설정해야 한다. 이전 전후 지역·날짜·폴더 수, 원본 사진 수·크기·해시, 비고·상태를 모두 확인한 후 사용 주소를 전환한다. 기존 자료는 검증 완료 전 삭제하지 않는다.

## 비용과 제한

무료 범위를 목표로 하고 요금제 업그레이드는 하지 않는다. Cloudflare Workers Free는 일 10만 요청과 요청당 10ms CPU 제한이 있으며, R2 Standard는 월 10GB-month 저장량, Class A 100만 회·Class B 1천만 회 무료 범위를 제공한다. R2는 무료량을 넘으면 과금될 수 있고 활성화 시 결제 수단을 요구할 수 있다. 이 단계가 나오면 사용자 설정이 필요하다. 대규모 ZIP의 CPU 사용량은 실제 계정에서 확인해야 한다.

- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/r2/pricing/

배포 스크립트는 계정 ID 확인 없이 배포하지 않으며, 요금제 변경·결제 수단 등록·이전 사이트 삭제를 수행하지 않는다.
