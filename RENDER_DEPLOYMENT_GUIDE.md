# 🚀 Render Deployment Guide for Luxe Backend

## 📋 **Prerequisites**
- ✅ GitHub repository: `Top-g99/luxe-backend`
- ✅ Working local server (confirmed working)
- ✅ Clean codebase (ready for deployment)

## 🌐 **Step 1: Go to Render.com**
1. Open [https://render.com](https://render.com)
2. Click **"Get Started"** or **"Sign Up"**
3. Choose **"Continue with GitHub"**
4. Authorize Render to access your GitHub account

## 🔗 **Step 2: Connect Repository**
1. After login, click **"New +"**
2. Select **"Web Service"**
3. Click **"Connect a repository"**
4. Find and select **`Top-g99/luxe-backend`**
5. Click **"Connect"**

## ⚙️ **Step 3: Configure Service**
1. **Name**: `luxe-staycations-api`
2. **Region**: Choose closest to you (e.g., `Oregon (US West)` or `Singapore`)
3. **Branch**: `main`
4. **Root Directory**: Leave empty (default)
5. **Runtime**: `Node`
6. **Build Command**: `npm install`
7. **Start Command**: `npm start`

## 🔑 **Step 4: Environment Variables**
Add these environment variables:
- **Key**: `NODE_ENV` | **Value**: `production`
- **Key**: `PORT` | **Value**: `10000` (Render's default)

## 🚀 **Step 5: Deploy**
1. Click **"Create Web Service"**
2. Wait for build to complete (should take 2-3 minutes)
3. Your API will be available at: `https://luxe-staycations-api.onrender.com`

## ✅ **Expected Result**
- ✅ Build succeeds (minimal dependencies)
- ✅ Service starts successfully
- ✅ Health check passes: `/health`
- ✅ API responds: `/`

## 🧪 **Test Your Deployment**
Once deployed, test these endpoints:
```bash
# Health check
curl https://luxe-staycations-api.onrender.com/health

# Main endpoint
curl https://luxe-staycations-api.onrender.com/
```

## 🆘 **If Something Goes Wrong**
- Check the build logs in Render dashboard
- Verify all environment variables are set
- Ensure the repository is properly connected

## 🎯 **Next Steps After Deployment**
1. Test all endpoints
2. Update frontend to use new API URL
3. Add your Supabase environment variables
4. Scale up if needed

---
**🎉 Your backend will be live in minutes! 🎉**
