# 🚀 Atomiser Setup Guide

This guide covers everything you need to know to get the Atomiser Smart Humidity Controller running from a fresh Git clone. It includes configuring the ESP32 hardware, installing dependencies, and running the local dashboard.

---

## 1️⃣ Prerequisites
Before starting, ensure your system has the following installed:
* **Visual Studio Code (VS Code)**
* **Node.js** (v18 or higher)
* **PlatformIO IDE Extension** (Install this from the Extensions tab inside VS Code).
* **Git**

---

## 2️⃣ Clone the Repository
Open your terminal and clone the project:

```bash
git clone https://github.com/JatinMakhija-10/Atomiser.git
cd Atomiser
```

---

## 3️⃣ Configure the ESP32 Firmware
PlatformIO requires its operational files (like `platformio.ini`) to be at the root of the VS Code workspace. 

1. In VS Code, go to **File > Open Folder...** and explicitly open the `Atomiser/firmware` folder.
2. In the file explorer, open `src/config.h`.
3. Change the Wi-Fi credentials to match your local network:

```cpp
#define WIFI_SSID     "Your_Network_Name"
#define WIFI_PASSWORD "Your_Password"
```
4. Save the file.

---

## 4️⃣ Upload to the ESP32
1. Plug your ESP32 into your computer via a data-capable USB cable.
2. You can upload the firmware using either the **PlatformIO UI** (clicking the alien icon on the left, then clicking `Upload` under `esp32`) OR by running the following command in the VS Code terminal (ensure you are inside the `firmware` folder):

```bash
pio run -t upload
```

> **⚠️ Hardware Quirk:** Many generic ESP32 boards will not automatically enter download mode. When the terminal output says `Connecting........_____.....`, physically **press and hold the BOOT button** on the ESP32 until the percentage progress bar starts to increase!

3. Once uploaded successfully, open the Serial Monitor to watch the ESP32 boot up and connect to your Wi-Fi:

```bash
pio device monitor
```
4. Press the **EN (Reset)** button on the ESP32 once. Watch the terminal output until it connects to Wi-Fi and prints out its assigned **IP Address** (e.g., `192.168.1.50`). 
5. **Copy this IP address,** you will need it for the backend!

---

## 5️⃣ Run the Node.js Backend 
Now that the ESP32 is running on your network, you need to spin up the Node.js server that acts as a bridge between the ESP32 and the Web Dashboard.

1. Open a fresh terminal and navigate to the `backend` folder:

```bash
cd Atomiser/backend
```

2. Install the required Node dependencies:

```bash
npm install
```

3. Start the server, passing the ESP32's IP address you copied earlier. The command differs slightly depending on your operating system:

**On Windows (PowerShell):**
```powershell
$env:ESP32_IP="192.168.1.50"; node server.js
```

**On Windows (Command Prompt / CMD):**
```cmd
set ESP32_IP=192.168.1.50 && node server.js
```

**On Mac / Linux:**
```bash
ESP32_IP="192.168.1.50" node server.js
```

You should see terminal output saying the backend is running on `http://localhost:3000` and the WebSocket server is active.

---

## 6️⃣ View the Dashboard
1. Open your favorite web browser.
2. Navigate to:
   
   **`http://localhost:3000`**

3. The dashboard will load. If everything is configured correctly, the top right corner will show a green **"Connected"** badge and you will see live temperature, humidity, and gas data streaming from your ESP32!

> **💡 IP Change Tip:** If you restart your ESP32 in the future and your router gives it a new IP address, you *do not* have to restart the Node backend. Simply open the dashboard in your browser, scroll to the Settings, and type the new IP address into the `UPDATE ESP32 IP` field dynamically!