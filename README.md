backend/
├── src/
│   ├── app.js          ← khởi tạo express + socket.io
│   ├── db.js
│   ├── routes/
│   │   └── order.js    ← API nhận order và emit realtime
│   └── socket.js       ← (tùy chọn) tách logic socket nếu muốn
├── .env
└── package.json


Client
 └── gửi JWT (Authorization Bearer)
Backend
 ├── authMiddleware (verify token)
 ├── roleMiddleware (check role)
 └── router admin / staff / kitchen


Backend (Express)
 ├─ Login → cấp JWT
 ├─ Middleware verifyToken
 ├─ Middleware checkRole(admin)
 ├─ API admin/*


 server/
├─ src/
│  ├─ db.js
│  ├─ index.js
│  ├─ routes/
│  │   ├─ admin.js
│  │   ├─ auth.js        👈 LOGIN
│  ├─ middleware/
│  │   ├─ auth.js        👈 verifyToken, requireRole
│  └─ .env



routes/
 ├─ adminAuth.js     👉 login
 ├─ admin.js         👉 stats, orders, dashboard
 ├─ auth.js          👉 client / staff (nếu có)
 ├─ order.js


backend/
├── src/
│   ├── routes/
│   │   └── menuImport.js
│   ├── uploads/
│   │   └── excel/
│   ├── db.js
│   └── app.js



 backend-order
 ├── main      → Railway PROD
 ├── staging   → Railway STG
 ├── develop
 └── feature/*.  //func