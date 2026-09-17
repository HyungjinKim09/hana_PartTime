Hanaparttime PC 배포 파일

1. ZIP을 먼저 전부 압축 해제하세요. ZIP 안에서 바로 실행하지 마세요.
2. Windows: START-WINDOWS.cmd를 더블클릭하세요.
   macOS/Linux: 터미널에서 이 폴더로 이동해 node pc-deploy.mjs를 실행하세요.
3. Node.js가 없으면 안내된 공식 사이트에서 LTS 버전을 설치한 뒤 다시 실행하세요.
4. 열리는 일반 브라우저에서 본인 Cloudflare 계정으로 로그인하고 Allow를 누르세요.
5. 계정이 여러 개면 배포할 계정 번호를 입력하세요.
6. 실행 창에 나온 workers.dev 주소만 채팅으로 알려 주세요.

이 프로그램은 공식 Wrangler 4.92.0을 사용합니다. 로그인·배포 권한은 본인 PC에만 저장됩니다.
생성·수정 대상: hanaparttime 서버, hanaparttime-db DB, 비공개 hanaparttime-photos R2 버킷.
R2 미활성화 또는 결제 수단 등록 요구가 나오면 자동으로 결제하거나 요금제를 변경하지 않고 중단됩니다.
무료량 초과 과금 가능성이 있으므로 R2 활성화 화면에 표시된 조건을 확인하세요.

최초 배포 후 사이트의 '관리자 계정 설정'에서 공용 아이디와 비밀번호를 설정하세요.
관리 키는 이 폴더의 .deploy-secrets/production.json 파일 안에 있습니다.
공용 사용자에게는 공용 아이디·비밀번호만 전달하고 관리 키를 전달하지 마세요.
관리 키, Cloudflare 비밀번호, OAuth 토큰, 쿠키, API 토큰을 채팅에 올리지 마세요.

기존 사이트의 일정·비고·사진은 삭제하거나 변경하지 않습니다.
이 파일은 새 서버 배포용입니다. 기존 자료 이전은 아직 실행되지 않았으며 새 주소 확인 후 별도로 진행해야 합니다.
배포 명령 성공과 실제 서비스 검증은 다릅니다. 로그인, 사진 원본 업로드·다운로드 및 일일보고를 새 주소에서 확인해야 합니다.

출처: https://developers.cloudflare.com/workers/wrangler/commands/
       https://developers.cloudflare.com/r2/pricing/
