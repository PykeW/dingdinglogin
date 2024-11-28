import express from 'express'
import { contact_1_0, oauth2_1_0 } from '@alicloud/dingtalk'
import * as $OpenApi from '@alicloud/openapi-client'
import * as $Util from '@alicloud/tea-util'
import fs from 'fs'

const CLIENTID = 'ding3tzwvbu0dvxdtunc' // 应用 client_id
const CLIENTSECRET = 'mQuZdUKdrjP945fUL4lopBDzibthaBulkOaglMi2N22VmZdt7HI9Oyx_T7GQRYF' // 应用 client_secret

const app = express()
app.use(express.static('public'))

// 添加 CORS 中间件
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Accept');
  next();
});

/**
 * 获取用户授权
 */
app.get('/auth', async (req, res) => {
  console.log('收到认证请求，authCode:', req.query.authCode);
  
  const config = new $OpenApi.Config({ })
  config.protocol = 'https'
  config.regionId = 'central'
  
  try {
    const client = new oauth2_1_0.default(config)
    const getUserTokenRequest = new oauth2_1_0.GetUserTokenRequest({
      clientId: CLIENTID,
      clientSecret: CLIENTSECRET,
      code: req.query.authCode,
      refreshToken: '',
      grantType: 'authorization_code',
    })
    
    console.log('准备获取用户token...');
    const result = await client.getUserToken(getUserTokenRequest)
    console.log('获取token结果:', result.body);
    
    console.log('准备获取用户信息...');
    const info = await getUserInfo(result.body.accessToken)
    console.log('用户信息:', info.body);
    console.log('部门IDs:', info.body.deptIds);
    
    // 将用户信息记录到日志文件
    fs.appendFile('user_info_log.txt', JSON.stringify(info.body) + '\n', (err) => {
      if (err) {
        console.error('记录用户信息失败:', err);
      } else {
        console.log('用户信息已记录');
      }
    });
    
    res.send(info.body);
  } catch (error) {
    console.error('获取用户信息失败:', error);
    res.status(500).send('获取用户信息失败');
  }
});

/**
 * 获取用户信息
 * @param {string} accessToken - 用户访问令牌
 * @returns {Promise<object>} - 用户信息
 */
async function getUserInfo(accessToken) {
  const config = new $OpenApi.Config({ })
  config.protocol = 'https'
  config.regionId = 'central'
  
  const client = new contact_1_0.default(config)
  const getUserRequest = new contact_1_0.GetUserRequest({
    accessToken: accessToken,
  })
  
  return await client.getUser(getUserRequest)
}

app.listen(3666, '10.0.40.25', () => {
  console.log('服务器已启动，监听地址 10.0.40.25:3666');
});