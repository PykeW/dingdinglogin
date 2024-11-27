import express from 'express'
import { contact_1_0, oauth2_1_0 } from '@alicloud/dingtalk'
import * as $OpenApi from '@alicloud/openapi-client'
import * as $Util from '@alicloud/tea-util'
import Database from 'better-sqlite3'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'

const CLIENTID = 'ding3tzwvbu0dvxdtunc'
const CLIENTSECRET = 'mQuZdUKdrjP945fUL4lopBDzibthaBulQkOaglMi2N22VmZdt7HI9Oyx_T7GQRYF'

// 添加 JWT 密钥
const JWT_SECRET = 'your-secret-key-heils-2024' // 建议使用环境变量存储

// 声明全局数据库变量
let db;

// 初始化数据库时添加日志
console.log('\n=== 初始化数据库 ===');
try {
  db = new Database('users.db', { verbose: console.log }); // 将 db 赋值给全局变量
  console.log('数据库连接成功');
} catch (error) {
  console.error('数据库初始化失败:', error);
  process.exit(1);
}

// 创建用户表时添加日志
console.log('\n=== 创建用户表 ===');
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      email TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      nick TEXT,
      mobile TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('用户表创建/确认成功');
} catch (error) {
  console.error('创建用户表失败:', error);
  process.exit(1);
}

// 密码加密函数
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex')
  return { hash, salt }
}

// 验证密码
function verifyPassword(password, hash, salt) {
  const { hash: newHash } = hashPassword(password, salt)
  return newHash === hash
}

// 用户数据库操作
const userDB = {
  // 检查用户是否存在
  async checkUserExists(email) {
    console.log(`检查用户是否存在: ${email}`);
    try {
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      console.log('查询结果:', user ? '用户存在' : '用户不存在');
      return !!user;
    } catch (error) {
      console.error('检查用户存在时出错:', error);
      throw error;
    }
  },

  // 创建新用户
  async createUser(userData) {
    console.log('\n--- 开始创建新用户 ---');
    console.log('用户数据:', {
      email: userData.email,
      password: '******',
      nick: userData.nick,
      mobile: userData.mobile
    });

    const { email, password, nick, mobile } = userData;
    try {
      const { hash, salt } = hashPassword(password);
      console.log('密码加密完成');

      const stmt = db.prepare(`
        INSERT INTO users (email, password_hash, salt, nick, mobile)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      console.log('执行数据库插入...');
      const result = stmt.run(email, hash, salt, nick, mobile);
      console.log('插入结果:', result);
      
      return true;
    } catch (error) {
      console.error('创建用户失败，详细错误:', error);
      console.error('错误堆栈:', error.stack);
      return false;
    }
  },

  // 验证用户登录
  async verifyUser(email, password) {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
    if (!user) return false
    
    return verifyPassword(password, user.password_hash, user.salt)
  },

  // 添加根据邮箱获取用户信息的方法
  async getUserByEmail(email) {
    console.log(`获取用户信息: ${email}`);
    try {
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (!user) {
        console.log('用户不存在');
        return null;
      }
      console.log('获取用户信息成功');
      return {
        email: user.email,
        nick: user.nick,
        mobile: user.mobile
      };
    } catch (error) {
      console.error('获取用户信息失败:', error);
      throw error;
    }
  }
}

// 创建钉钉服务对象
const dingtalk = {
  async getUserToken(authCode) {
    const config = new $OpenApi.Config({})
    config.protocol = 'https'
    config.regionId = 'central'
    
    const client = new oauth2_1_0.default(config)
    const getUserTokenRequest = new oauth2_1_0.GetUserTokenRequest({
      clientId: CLIENTID,
      clientSecret: CLIENTSECRET,
      code: authCode,
      grantType: 'authorization_code',
    })
    
    const result = await client.getUserToken(getUserTokenRequest)
    return result.body
  },

  async getUserInfo(accessToken) {
    const config = new $OpenApi.Config({})
    config.protocol = 'https'
    config.regionId = 'central'
    
    const client = new contact_1_0.default(config)
    const getUserHeader = new contact_1_0.GetUserHeaders()
    getUserHeader.xAcsDingtalkAccessToken = accessToken
    
    const result = await client.getUserWithOptions('me', getUserHeader, new $Util.RuntimeOptions())
    return result.body
  }
}

const app = express()
app.use(express.static('public'))
app.use(express.json())

// 添加 CORS 中间件
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Accept');
  next();
});

// 生成 token 的函数
function generateToken(user) {
  return jwt.sign(
    { 
      email: user.email,
      nick: user.nick 
    }, 
    JWT_SECRET, 
    { expiresIn: '24h' }
  );
}

// 验证 token 的中间件
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ 
      error: '未授权',
      message: '请先登录' 
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ 
        error: '令牌无效',
        message: '请重新登录' 
      });
    }
    req.user = user;
    next();
  });
};

// 创建一个简单的主页面路由
app.get('/main', authenticateToken, (req, res) => {
  res.send(`
    <html>
      <head>
        <title>登录成功</title>
        <style>
          body {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-family: Arial, sans-serif;
            background-color: #f0f2f5;
          }
          .success-message {
            text-align: center;
            padding: 40px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          h1 {
            color: #52c41a;
            margin-bottom: 20px;
          }
        </style>
      </head>
      <body>
        <div class="success-message">
          <h1>登录成功！</h1>
          <p>欢迎访问系统，${req.user.email}</p>
        </div>
      </body>
    </html>
  `);
});

// 修改认证路由，简化登录流程
app.get('/auth', async (req, res) => {
  try {
    const { authCode } = req.query;
    console.log('\n=== 开始处理钉钉登录请求 ===');
    console.log('收到的 authCode:', authCode);

    // 获取钉钉用户信息
    const tokenResult = await dingtalk.getUserToken(authCode);
    const userInfo = await dingtalk.getUserInfo(tokenResult.accessToken);
    
    // 添加详细的用户信息日志
    console.log('\n=== 钉钉用户信息 ===');
    console.log('用户ID:', userInfo.unionId);
    console.log('姓名:', userInfo.nick);
    console.log('邮箱:', userInfo.email);
    console.log('手机:', userInfo.mobile);
    console.log('部门:', userInfo.orgEmail);
    console.log('职位:', userInfo.title);
    console.log('========================\n');

    // 检查邮箱域名
    if (!userInfo.email?.endsWith('@heils.cn')) {
      return res.status(403).json({
        success: false,
        error: '未授权访问',
        message: '只允许 @heils.cn 域名的用户登录'
      });
    }

    // 检查用户是否已绑定账号
    const isBound = await userDB.checkUserExists(userInfo.email);
    console.log('用户绑定状态:', isBound ? '已绑定' : '未绑定');
    
    if (isBound) {
      // 已绑定用户，获取用户信息并生成 token
      const token = generateToken({
        email: userInfo.email,
        nick: userInfo.nick
      });
      
      console.log('生成 token 成功，准备返回数据');
      return res.json({
        success: true,
        token: token,
        isBound: true,
        info: userInfo
      });
    } else {
      // 未绑定用户，返回用户信息
      console.log('用户未绑定，返回用户信息');
      return res.json({
        success: true,
        info: userInfo,
        isBound: false
      });
    }

  } catch (error) {
    console.error('认证错误:', error);
    res.status(500).json({
      success: false,
      error: '登录处理失败',
      message: error.message
    });
  }
});

// 修改绑定账号路由，添加更多日志
app.post('/api/bind-account', async (req, res) => {
  console.log('\n=== 开始处理账号绑定请求 ===');
  console.log('请求头:', req.headers);
  console.log('请求体:', {
    email: req.body.email,
    password: '******'
  });

  try {
    const { email, password } = req.body;
    
    // 参数验证
    if (!email || !password) {
      console.log('参数验证失败:', { email: !!email, password: !!password });
      return res.status(400).json({
        error: '参数错误',
        message: '邮箱和密码不能为空'
      });
    }

    // 检查用户是否已存在
    console.log('\n--- 检查用户是否已存在 ---');
    const exists = await userDB.checkUserExists(email);
    
    if (exists) {
      console.log('用户已存在，拒绝创建');
      return res.status(400).json({
        error: '账号已存在',
        message: '该邮箱已经绑定了账号'
      });
    }

    // 创建新用户
    console.log('\n--- 开始创建新用户 ---');
    const success = await userDB.createUser({
      email,
      password,
      nick: null,
      mobile: null
    });

    if (success) {
      console.log('用户创建成功');
      const token = generateToken({
        email: email,
        nick: null
      });
      
      res.json({ 
        success: true,
        token: token
      });
    } else {
      console.log('用户创建失败');
      throw new Error('创建用户失败');
    }
    
  } catch (error) {
    console.error('\n!!! 绑定账号失败 !!!');
    console.error('错误类型:', error.constructor.name);
    console.error('错误消息:', error.message);
    console.error('错误堆栈:', error.stack);
    res.status(500).json({
      error: '绑定账号失败',
      message: error.message
    });
  }
});

// 添加账号密码登录路由
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email?.endsWith('@heils.cn')) {
      return res.status(403).json({
        error: '未授权访问',
        message: '只允许 @heils.cn 域名的用户登录'
      });
    }

    const isValid = await userDB.verifyUser(email, password);
    
    if (isValid) {
      // 登录成功，生成 token
      const user = await userDB.getUserByEmail(email);
      const token = generateToken(user);
      
      res.json({ 
        success: true,
        token: token
      });
    } else {
      res.status(401).json({
        success: false,
        message: '邮箱或密码错误'
      });
    }
  } catch (error) {
    console.error('登录失败:', error);
    res.status(500).json({
      error: '登录失败',
      message: error.message
    });
  }
});

app.listen(3666, '10.0.2.202', () => {
  console.log(`Server running on http://10.0.2.202:3666`)
})

