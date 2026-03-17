cd backend
npx ts-node src/index.ts 2>&1 | Select-Object -First 50
