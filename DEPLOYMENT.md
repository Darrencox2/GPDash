# Buddy System - Deployment Guide

## What You'll Get
A web app at `https://your-name.vercel.app` that your whole practice can access with a shared password.

---

## Step 1: Create GitHub Account (if needed)

1. Go to **https://github.com/signup**
2. Create a free account with your email
3. Verify your email address

---

## Step 2: Upload This Code to GitHub

1. Log into GitHub
2. Click the **+** icon (top right) → **New repository**
3. Name it `buddy-system`
4. Keep it **Private** (for practice data security)
5. Click **Create repository**
6. On the next page, click **"uploading an existing file"**
7. Drag and drop **ALL the files** from this folder
8. Click **Commit changes**

---

## Step 3: Create Vercel Account

1. Go to **https://vercel.com/signup**
2. Click **"Continue with GitHub"**
3. Authorize Vercel to access your GitHub

---

## Step 4: Deploy to Vercel

1. In Vercel dashboard, click **"Add New..."** → **Project**
2. Find and select your `buddy-system` repository
3. Click **Deploy**
4. Wait ~2 minutes for it to build

---

## Step 5: Add Storage (Vercel KV)

1. In your Vercel project, go to **Storage** tab
2. Click **Create Database** → **KV**
3. Name it `buddy-data`
4. Click **Create**
5. Vercel automatically connects it to your project

---

## Step 6: Set the Password

1. Go to **Settings** → **Environment Variables**
2. Add a new variable:
   - **Name:** `APP_PASSWORD`
   - **Value:** Your chosen practice password (e.g., `WinscombeBuddy2024!`)
3. Click **Save**
4. Go to **Deployments** tab and click **Redeploy** on the latest deployment

---

## Step 7: Access Your App

Your app is now live at the URL shown in Vercel (something like `buddy-system-xyz.vercel.app`).

Share this URL and the password with your team!

---

## Changing the Password Later

1. Go to Vercel → Your project → **Settings** → **Environment Variables**
2. Edit `APP_PASSWORD`
3. Click **Redeploy** to apply changes

---

## Custom Domain (Optional)

If you want a nicer URL like `buddy.wbfp.co.uk`:

1. Go to **Settings** → **Domains**
2. Add your domain
3. Update your DNS as instructed

---

## Troubleshooting

**"Unauthorized" error:** Check the password is correct in Environment Variables and you've redeployed.

**Data not saving:** Make sure KV storage is connected (check Storage tab).

**Build failed:** Check the Deployments tab for error messages.

---

## Support

The app is self-contained. If you need changes, you can edit the code in GitHub and Vercel will automatically redeploy.
