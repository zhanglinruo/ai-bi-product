cd backend
npx tsc --noEmit 2>&1 | Select-Object -First 50
