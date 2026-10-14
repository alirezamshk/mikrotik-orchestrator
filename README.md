# ⚡ MikroTik Fleet Orchestrator (RouterOS v7)

<div align="center">

![MikroTik](https://img.shields.io/badge/MikroTik-RouterOS%20v7.x-006699?style=for-the-badge&logo=mikrotik&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

**سیستم مدرن، جامع و متمرکز برای اتوماسیون کامل روتینگ، فایروال، تونل‌سازی و راه‌اندازی سرویس‌های VPN روی ناوگان روترهای میکروتیک**

[ویژگی‌ها](#-ویژگی‌های-کلیدی) • [معماری شبکه](#-معماری-شبکه-و-جریان-ترافیک) • [نصب و راه‌اندازی](#-راهنمای-نصب-و-اجرا) • [سناریوهای ویزارد](#-سناریوهای-هوشمند-ویزارد)

</div>

---

## 🌟 ویژگی‌های کلیدی

- 🚀 **ویزارد هوشمند ۴ مرحله‌ای (Smart Setup Wizard):**
  - **سناریوی راه‌اندازی کامل (Fresh Setup):** از بررسی اتصال و تولید سرتیفیکیت تا ساخت خودکار تونل‌ها و فایروال.
  - **سناریوی شناسایی و همگام‌سازی تونل‌های موجود (Adopt Tunnels):** اسکن خودکار تونل‌های GRE و L2TP-Ethernet از قبل ایجاد شده روی میکروتیک و تزریق روتینگ و سرویس‌ها بدون نیاز به بازسازی تونل.
  - **سناریوی سرویس‌ها و فایروال (Services Only):** پیکربندی RADIUS، IKEv2، کلپ‌کردن MSS، سورس‌نت و اسکریپت روزانه IPDeny ایران.
- 🌐 **مدیریت مقصدها و کشورها به صورت ماژولار:**
  - فعال/غیرفعال‌سازی تک به تک کشورها با کارت‌های شیشه‌ای و پرچم لوکیشن‌ها.
  - امکان تغییر لحظه‌ای پورت (مثلاً ۶۰۶۶، ۴۴۳، ۱۱۹۴ و ...) و پروتکل (UDP / TCP) برای هر کشور.
  - پشتیبانی همزمان از تونل‌های **GRE** و **L2TPv3 Ethernet (Unmanaged)**.
- 🛡️ **فایروال، امنیت و پایداری شبکه:**
  - **سورس‌نت استاندارد (Source NAT / Masquerade):** جداسازی ترافیک WAN ایران و لیست تونل‌ها (`TUNNELS`) با جلوگیری از افتادن لوپ یا ماسک‌شدن IP در کانتینرها و ۳x-ui.
  - **مسیریابی مبتنی بر سیاست (PBR) با استثنا کردن ایران:** خروج ترافیک داخلی و بانکی بدون عبور از فیلترشکن (`dst-address-list=!IRAN`).
  - **سیستم Killswitch خودکار:** مسیر پشتیبان Blackhole با Distance=10 برای جلوگیری از نشت ترافیک در صورت قطع شدن تونل خارج.
- 🔄 **پشتیبانی دوگانه (Live RouterOS & Mock Simulator):**
  - قابلیت سوئیچ لحظه‌ای با یک کلیک بین **میکروتیک واقعی (Live ROS)** و **شبیه‌ساز تستی (Simulator)**.
  - گزارش خطای دقیق در صورت اشتباه بودن رمز عبور یا بسته بودن پورت API (8728).
- 🎨 **رابط کاربری مدرن (Modern SaaS UI/UX):**
  - فونت زیبا و استاندارد فارسی **وزیرمتن (Vazirmatn)** و **JetBrains Mono**.
  - طراحی Dark Mode، کارت‌های آماری زنده و لاگ شیشه‌ای دستورات CLI میکروتیک.

---

## 📐 معماری شبکه و جریان ترافیک

```
┌─────────────────────────────────────────────────────────────┐
│                       کاربر نهایی                           │
└──────────────────────────────┬──────────────────────────────┘
                               │
            OpenVPN (UDP/TCP)  │  IKEv2 EAP-RADIUS
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    روتر میکروتیک (ایران)                   │
│                                                             │
│   1. Mangle Prerouting:                                     │
│      ├─ مقصد ایران (dst-address-list=IRAN) ───────────────┐ │
│      │  (خروج مستقیم از WAN بدون تونل)                    │ │
│      │                                                     ▼ │
│      └─ مقصد خارج (!IRAN)                                WAN │
│         مارک روتینگ اختصاصی: routing-mark=to-<country>    (ether1)
│                                                             │
│   2. جدول روتینگ اختصاصی (Routing Table to-<country>):      │
│      ├─ روت اصلی: gateway=<tunnel-remote-ip> distance=1     │
│      └─ روت کیل‌سوئیچ: blackhole=yes distance=10           │
│                                                             │
│   3. خروج ترافیک از لیست TUNNELS با Masquerade              │
└──────────────────────────────┬──────────────────────────────┘
                               │
                   GRE / L2TPv3 Ethernet
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    سرور مقصد (خارج از کشور)                 │
│              (آلمان، فنلاند، هلند، انگلیس، آمریکا ...)      │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 راهنمای نصب و اجرا

### پیش‌نیازها
- پایتون نسخه ۳.۱۰ یا بالاتر
- روتر میکروتیک با RouterOS نسخه 7.x (فعال بودن سرویس `api` روی پورت ۸۷۲۸)

### ۱. کلون کردن ریپازیتوری
```bash
git clone https://github.com/alirezamshk/mikrotik-orchestrator.git
cd mikrotik-orchestrator
```

### ۲. ساخت محیط مجازی پایتون و نصب وابستگی‌ها
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### ۳. اجرای سرور
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload
```

داشبورد مدیریتی هم‌اکنون در آدرس زیر در دسترس است:
👉 **`http://localhost:8080`**

---

## ⚙️ متغیرهای پیکربندی (`.env`)

می‌توانید یک فایل `.env` در ریشه پروژه قرار دهید:

```env
APP_NAME="MikroTik Fleet Orchestrator"
HOST="0.0.0.0"
PORT=8080
MOCK_MODE=false
DEFAULT_API_PORT=8728
DEFAULT_WINBOX_PORT=2020
DEFAULT_RADIUS_IP="91.199.27.107"
```

---

## 🛠️ ساختار پروژه

```
mikrotik-orchestrator/
├── app/
│   ├── config.py             # تنظیمات عمومی و متغیرهای سیستم
│   ├── main.py               # اندپوینت‌های FastAPI و ویزارد هوشمند
│   ├── core/
│   │   └── ros_client.py     # کلاینت ارتباط مستقیم RouterOS API و شبیه‌ساز
│   ├── models/
│   │   ├── destination.py    # ساختار داده تونل‌ها و لوکیشن‌ها
│   │   └── server.py         # اطلاعات اتصال سرورها
│   ├── services/
│   │   └── fleet_service.py  # مدیریت انبار سرورها
│   └── web/
│       ├── static/           # استایل‌های CSS و کدهای جاوااسکریپت
│       └── templates/        # قالب‌های HTML داشبورد
├── requirements.txt
└── README.md
```

---

## 📄 مجوز (License)
این پروژه تحت مجوز **MIT** منتشر شده است. استفاده، ویرایش و توسعه آن کاملاً آزاد است.
