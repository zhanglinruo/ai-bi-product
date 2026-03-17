import bcrypt from 'bcryptjs';

const hash = bcrypt.hashSync('admin123', 10);
console.log('Admin password hash for "admin123":');
console.log(hash);
