let videoStream = null;
let capturedPhotos = [];

let faceDetected = false;
let currentLandmarks = null;

let livenessPassed = false;
let livenessActive = false;
let livenessStage = "idle";
let livenessPaused = false;

let centerNoseX = null;
let stableFrames = 0;
let mouthOpened = false;
let livenessTimeoutId = null;

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function distanceBetweenPoints(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    input.type = input.type === "password" ? "text" : "password";
}

function isValidEmail(email) {
    return email.includes("@");
}

function isValidUsername(username) {
    return /^[A-Za-zА-Яа-яІіЇїЄєҐґ\s_]+$/.test(username);
}

function showMessage(text, success = true) {
    const message = document.getElementById("faceUploadMessage");
    if (!message) return;

    message.style.display = "block";
    message.innerText = text;
    message.className = success
        ? "message-box message-success"
        : "message-box message-error";
}

async function registerUser() {
    const username = document.getElementById("regUsername").value.trim();
    const email = document.getElementById("regEmail").value.trim();
    const password = document.getElementById("regPassword").value;
    const passwordRepeat = document.getElementById("regPasswordRepeat").value;
    const message = document.getElementById("registerMessage");

    if (!username || !email || !password || !passwordRepeat) {
        message.innerText = "Заповніть усі поля";
        return;
    }

    if (!isValidUsername(username)) {
        message.innerText = "Ім'я користувача не повинно містити цифри";
        return;
    }

    if (!isValidEmail(email)) {
        message.innerText = "Електронна адреса повинна містити символ @";
        return;
    }

    if (password !== passwordRepeat) {
        message.innerText = "Паролі не співпадають";
        return;
    }

    const response = await fetch("/register", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            username,
            email,
            password
        })
    });

    const data = await response.json();

    if (response.ok) {
        message.innerText = data.message;
        setTimeout(() => {
            window.location.href = "/login-page";
        }, 1000);
    } else {
        message.innerText = data.detail;
    }
}

async function loginUser() {
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const message = document.getElementById("loginMessage");

    if (!email || !password) {
        message.innerText = "Заповніть усі поля";
        return;
    }

    if (!isValidEmail(email)) {
        message.innerText =
            "Електронна адреса повинна містити символ @";
        return;
    }

    const response = await fetch("/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            email,
            password
        })
    });

    const data = await response.json();

    if (response.ok) {

        localStorage.setItem(
            "userId",
            data.userId
        );

        localStorage.setItem(
            "username",
            data.username
        );

        localStorage.setItem(
            "role",
            data.role
        );

        localStorage.setItem(
            "faceVerified",
            "false"
        );

        if (
            data.role === "admin" ||
            data.role === "special_user"
        ) {

            window.location.href =
                "/dashboard";

        } else {

            window.location.href =
                "/robotics-resources";
        }

    } else {

        message.innerText =
            data.detail ||
            "Помилка входу";
    }
}

async function startCamera() {
    const video = document.getElementById("video");

    if (!video) return;

    if (videoStream) {
        video.srcObject = videoStream;

        const frame = document.getElementById("faceFrame");
        if (frame) frame.style.display = "block";

        return;
    }

    try {
        videoStream = await navigator.mediaDevices.getUserMedia({
            video: true
        });

        video.srcObject = videoStream;

        video.onloadedmetadata = () => {
            console.log("VIDEO READY");
            startFaceMesh();
        };

        const frame = document.getElementById("faceFrame");
        if (frame) frame.style.display = "block";

    } catch (error) {
        console.error(error);
        alert("Помилка камери");
    }
}

async function startFaceMesh() {
    const video = document.getElementById("video");
    const canvas = document.getElementById("faceMeshCanvas");

    if (!video || !canvas) {
        console.error("video або faceMeshCanvas не знайдено");
        return;
    }

    const ctx = canvas.getContext("2d");

    const faceMesh = new FaceMesh({
        locateFile: file => `/static/mediapipe/${file}`
    });

    faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    faceMesh.onResults(async results => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (
            results.multiFaceLandmarks &&
            results.multiFaceLandmarks.length > 0
        ) {
            const landmarks = results.multiFaceLandmarks[0];

            faceDetected = true;
            currentLandmarks = landmarks;

            await processLiveness(landmarks);

            drawConnectors(
                ctx,
                landmarks,
                FACEMESH_TESSELATION,
                {
                    color: "#22c55e",
                    lineWidth: 0.7
                }
            );
        } else {
            faceDetected = false;
            currentLandmarks = null;
        }
    });

    async function detectFace() {
        if (video.readyState >= 2) {
            await faceMesh.send({
                image: video
            });
        }

        requestAnimationFrame(detectFace);
    }

    detectFace();
}

async function pauseAndSetStage(stage, text, pause = 1200) {
    const message = document.getElementById("livenessMessage");

    livenessPaused = true;

    if (message) {
        message.innerText = text;
    }

    await delay(pause);

    livenessStage = stage;
    livenessPaused = false;
}

async function startLivenessCheck() {
    const video = document.getElementById("video");
    const message = document.getElementById("livenessMessage");
    const verifyButton = document.getElementById("verifyFaceButton");

    if (!video || !video.srcObject) {
        message.innerText = "Спочатку увімкніть камеру";
        return;
    }

    livenessPassed = false;
    livenessActive = true;
    livenessPaused = false;
    livenessStage = "look_straight";

    centerNoseX = null;
    stableFrames = 0;
    mouthOpened = false;

    verifyButton.disabled = true;

    message.innerText = "1. Подивіться прямо в камеру";

    if (livenessTimeoutId) {
        clearTimeout(livenessTimeoutId);
    }

    livenessTimeoutId = setTimeout(() => {
        if (!livenessPassed) {
            livenessActive = false;
            livenessStage = "idle";
            livenessPaused = false;
            verifyButton.disabled = true;

            message.innerText =
                "❌ Перевірку живої присутності не пройдено. Спробуйте ще раз";
        }
    }, 45000);
}

async function processLiveness(landmarks) {
    if (!livenessActive || livenessPaused || livenessPassed) {
        return;
    }

    const message = document.getElementById("livenessMessage");
    const verifyButton = document.getElementById("verifyFaceButton");

    const nose = landmarks[1];
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];

    const faceWidth = Math.abs(rightCheek.x - leftCheek.x);

    if (faceWidth < 0.18) {
        message.innerText = "Підійдіть ближче до камери";
        return;
    }

    if (livenessStage === "look_straight") {
        if (nose.x > 0.42 && nose.x < 0.58) {
            stableFrames++;

            if (stableFrames >= 12) {
                centerNoseX = nose.x;
                stableFrames = 0;

                await pauseAndSetStage(
                    "turn_right",
                    "✅ Прямий погляд зафіксовано. Пауза...",
                    1200
                );

                message.innerText = "2. Поверніть голову вліво";
            }
        } else {
            stableFrames = 0;
            message.innerText = "1. Подивіться прямо в камеру";
        }

        return;
    }

    if (livenessStage === "turn_right") {
        const movement = nose.x - centerNoseX;

        if (movement > 0.045) {
            stableFrames = 0;

            await pauseAndSetStage(
                "turn_left",
                "✅ Поворот вправо зафіксовано. Пауза...",
                1200
            );

            message.innerText = "3. Поверніть голову вправо";
        }

        return;
    }

    if (livenessStage === "turn_left") {
        const movement = nose.x - centerNoseX;

        if (movement < -0.045) {
            stableFrames = 0;

            await pauseAndSetStage(
                "blink",
                "✅ Поворот вліво зафіксовано. Пауза...",
                1200
            );

            message.innerText = "4. Моргніть";
        }

        return;
    }

    if (livenessStage === "blink") {
        const leftEyeTop = landmarks[159];
        const leftEyeBottom = landmarks[145];

        const rightEyeTop = landmarks[386];
        const rightEyeBottom = landmarks[374];

        const leftEyeOpen = distanceBetweenPoints(leftEyeTop, leftEyeBottom);
        const rightEyeOpen = distanceBetweenPoints(rightEyeTop, rightEyeBottom);

        const eyeOpenAverage = (leftEyeOpen + rightEyeOpen) / 2;

        if (eyeOpenAverage < 0.012) {
            await pauseAndSetStage(
                "mouth_open",
                "✅ Моргання зафіксовано. Пауза...",
                1200
            );

            message.innerText = "5. Відкрийте рот";
        }

        return;
    }

    if (livenessStage === "mouth_open") {
        const upperLip = landmarks[13];
        const lowerLip = landmarks[14];

        const mouthDistance = distanceBetweenPoints(upperLip, lowerLip);

        if (mouthDistance > 0.035) {
            mouthOpened = true;

            await pauseAndSetStage(
                "mouth_close",
                "✅ Рот відкрито. Пауза...",
                1200
            );

            message.innerText = "6. Закрийте рот";
        }

        return;
    }

    if (livenessStage === "mouth_close") {
        const upperLip = landmarks[13];
        const lowerLip = landmarks[14];

        const mouthDistance = distanceBetweenPoints(upperLip, lowerLip);

        if (mouthOpened && mouthDistance < 0.018) {
            livenessPassed = true;
            livenessActive = false;
            livenessPaused = false;
            livenessStage = "passed";

            if (livenessTimeoutId) {
                clearTimeout(livenessTimeoutId);
            }

            message.innerText = "7. ✅ Liveness passed";
            verifyButton.disabled = false;
        }
    }
}

async function autoCaptureFacePhotos(poseType = "front") {
    const faceVerified = localStorage.getItem("faceVerified");
    const hasFrontTemplate = localStorage.getItem("hasFrontTemplate");

    if (
        hasFrontTemplate === "true" &&
        faceVerified !== "true"
    ) {
        showMessage(
            "Спочатку пройдіть перевірку обличчя, а потім можна створювати нові шаблони",
            false
        );
        return;
    }

    const video = document.getElementById("video");
    const canvas = document.getElementById("canvas");
    const count = document.getElementById("capturedCount");

    if (!video || !video.srcObject) {
        showMessage("Спочатку увімкніть камеру", false);
        return;
    }

    if (!faceDetected) {
        showMessage("Обличчя не знайдено камерою. Дивіться прямо в камеру", false);
        return;
    }

    capturedPhotos = [];
    count.innerText = "0";

    showMessage("Створення біометричного шаблону розпочато...", true);

    for (let i = 1; i <= 5; i++) {
        await delay(1000);

        if (!faceDetected) {
            showMessage("Обличчя не знайдено. Дивіться прямо в камеру", false);
            i--;
            continue;
        }

        const context = canvas.getContext("2d", {
            willReadFrequently: true
        });

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        context.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        context.drawImage(
            video,
            0,
            0,
            canvas.width,
            canvas.height
        );

        const quality = analyzeFrameQuality(canvas, context);

        if (!quality.ok) {
            showMessage(quality.reason, false);
            i--;
            continue;
        }

        const blurCheck = analyzeBlur(canvas, context);

        if (!blurCheck.ok) {
            showMessage(blurCheck.reason, false);
            i--;
            continue;
        }

        const blob = await new Promise(resolve =>
            canvas.toBlob(resolve, "image/jpeg", 0.95)
        );

        if (!blob) {
            showMessage("Не вдалося створити фото", false);
            i--;
            continue;
        }

        capturedPhotos.push(blob);
        count.innerText = capturedPhotos.length;

        showMessage(`Захоплено фото ${i} з 5`, true);
    }

    showMessage("Фото захоплено. Збереження шаблону...", true);

    await uploadCapturedPhotos("front");

    localStorage.setItem("hasFrontTemplate", "true");

    playSuccessSound();
}

async function uploadCapturedPhotos(poseType = "front") {
    const userId = localStorage.getItem("userId");

    if (!userId) {
        showMessage("Користувач не авторизований", false);
        return;
    }

    if (capturedPhotos.length === 0) {
        showMessage("Спочатку зробіть хоча б одне фото", false);
        return;
    }

    const modeElement = document.getElementById("embeddingMode");
    const mode = modeElement ? modeElement.value : "append";

    const formData = new FormData();

    capturedPhotos.forEach((photo, index) => {
        formData.append("files", photo, `front_photo_${index + 1}.jpg`);
    });

    try {
        showMessage("Збереження фото...", true);

        const response = await fetch(
            `/add-face?user_id=${userId}&pose_type=front&mode=${mode}`,
            {
                method: "POST",
                body: formData
            }
        );

        const data = await response.json();

        if (response.ok) {
            showMessage(
                `${data.message}. Оброблено фото: ${data.photos_processed}`,
                true
            );

            capturedPhotos = [];
            document.getElementById("capturedCount").innerText = "0";
        } else {
            showMessage(data.detail || "Помилка збереження фото", false);
        }
    } catch (error) {
        console.error(error);
        showMessage("Помилка з'єднання із сервером", false);
    }
}

function analyzeFrameQuality(canvas, context) {
    const imageData = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
    ).data;

    let brightness = 0;

    for (let i = 0; i < imageData.length; i += 4) {
        brightness +=
            (imageData[i] + imageData[i + 1] + imageData[i + 2]) / 3;
    }

    brightness = brightness / (imageData.length / 4);

    if (brightness < 55) {
        return {
            ok: false,
            reason: "Недостатнє освітлення"
        };
    }

    if (brightness > 230) {
        return {
            ok: false,
            reason: "Занадто яскраве освітлення"
        };
    }

    return {
        ok: true
    };
}

function analyzeBlur(canvas, context) {
    const imageData = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
    );

    const data = imageData.data;
    let diff = 0;

    for (let i = 0; i < data.length - 4; i += 4) {
        diff += Math.abs(data[i] - data[i + 4]);
    }

    const sharpness = diff / (data.length / 4);

    if (sharpness < 1) {
        return {
            ok: false,
            reason: "Фото розмите. Не рухайтесь"
        };
    }

    return {
        ok: true
    };
}

async function verifyPose(poseType = "front") {
    const userId = localStorage.getItem("userId");
    const video = document.getElementById("video");
    const canvas = document.getElementById("canvas");

    if (!userId) {
        return {
            success: false,
            message: "Користувач не авторизований"
        };
    }

    if (!video || !video.srcObject) {
        return {
            success: false,
            message: "Спочатку увімкніть камеру"
        };
    }

    if (!faceDetected || !currentLandmarks) {
        return {
            success: false,
            message: "Обличчя не знайдено камерою. Подивіться прямо в камеру"
        };
    }

    if (video.videoWidth === 0 || video.videoHeight === 0) {
        return {
            success: false,
            message: "Камера ще не готова. Спробуйте ще раз"
        };
    }

    const context = canvas.getContext("2d", {
        willReadFrequently: true
    });

    const formData = new FormData();

    for (let i = 1; i <= 5; i++) {
        await delay(900);

        if (!faceDetected || !currentLandmarks) {
            i--;
            continue;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        context.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        // ВАЖЛИВО: для backend НЕ дзеркалимо кадр
        context.drawImage(
            video,
            0,
            0,
            canvas.width,
            canvas.height
        );

        const blob = await new Promise(resolve =>
            canvas.toBlob(
                resolve,
                "image/jpeg",
                0.95
            )
        );

        if (!blob) {
            return {
                success: false,
                message: "Не вдалося створити фото з камери"
            };
        }

        formData.append(
            "files",
            blob,
            `${poseType}_verify_${i}.jpg`
        );
    }

    const response = await fetch(
        `/authenticate-user-multiframe?user_id=${userId}&pose_type=${poseType}`,
        {
            method: "POST",
            body: formData
        }
    );

    return await response.json();
}

async function captureAndAuthenticateUser() {
    const role = localStorage.getItem("role");
    const message = document.getElementById("authMessage");
    const video = document.getElementById("video");
    const createBtn = document.getElementById("createFrontBtn");

    if (!message) return;

    if (!video || !video.srcObject) {
        message.innerHTML = `
            <div class="auth-result error">
                ❌ Спочатку увімкніть камеру
            </div>
        `;
        return;
    }

    if (
        (role === "admin" || role === "special_user") &&
        !livenessPassed
    ) {
        message.innerHTML = `
            <div class="auth-result error">
                ❌ Спочатку пройдіть перевірку живої присутності
            </div>
        `;
        return;
    }

    message.innerHTML = `
        <div class="auth-result info">
            ⏳ Перевірка обличчя...
        </div>
    `;

    try {
        const result = await verifyPose("front");

        const confidence = result.confidence !== undefined
            ? result.confidence
            : 0;

        const distance = result.distance !== undefined
            ? result.distance
            : 0;

        if (!result.success) {
            localStorage.setItem("faceVerified", "false");

            if (createBtn) {
                createBtn.disabled = true;
                createBtn.innerText =
                    "🔒 Спочатку пройдіть перевірку обличчя";
            }

            message.innerHTML = `
                <div class="auth-result error">
                    ❌ Обличчя не підтверджено<br>
                    Повідомлення: ${result.detail || result.message || "Помилка перевірки"}<br>
                    Рівень співпадіння: ${confidence}%<br>
                    Distance: ${Number(distance).toFixed(4)}
                </div>
            `;
            return;
        }

        localStorage.setItem("faceVerified", "true");

        if (createBtn) {
            createBtn.disabled = false;
            createBtn.innerText =
                "📷 Створити новий біометричний шаблон";
        }

        message.innerHTML = `
            <div class="auth-result success">
                ✅ Біометричну перевірку пройдено<br>
                Обличчя підтверджено<br>
                Рівень співпадіння: ${confidence}%<br>
                Distance: ${Number(distance).toFixed(4)}
            </div>
        `;

    } catch (error) {
        console.error(error);

        localStorage.setItem("faceVerified", "false");

        if (createBtn) {
            createBtn.disabled = true;
            createBtn.innerText =
                "🔒 Спочатку пройдіть перевірку обличчя";
        }

        message.innerHTML = `
            <div class="auth-result error">
                ❌ Помилка з'єднання із сервером або перевірки обличчя
            </div>
        `;
    }
}

function setupLivenessBlock() {
    const role = localStorage.getItem("role");
    const block = document.getElementById("livenessBlock");
    const verifyButton = document.getElementById("verifyFaceButton");

    if (!block || !verifyButton) return;

    if (role === "admin" || role === "special_user") {
        block.style.display = "block";
        verifyButton.disabled = false;
    } else {
        block.style.display = "none";
        verifyButton.disabled = true;
    }
}

function loadCurrentUser() {
    const username = localStorage.getItem("username");
    const role = localStorage.getItem("role");
    const userElement = document.getElementById("currentUsername");

    if (!userElement) return;

    if (username) {
        userElement.innerText =
            `Поточний користувач: ${username} | Роль: ${role}`;
    } else {
        userElement.innerText = "Користувач не авторизований";
    }
}

function logoutUser() {
    localStorage.removeItem("userId");
    localStorage.removeItem("username");
    localStorage.removeItem("role");
    localStorage.removeItem("faceVerified");

    window.location.href = "/";
}

function setupAdminButton() {
    const role = localStorage.getItem("role");
    const button = document.getElementById("adminPanelButton");

    if (!button) return;

    if (role === "admin") {
        button.style.display = "inline-block";
    } else {
        button.style.display = "none";
    }
}

function goToAdminPanel() {
    const role = localStorage.getItem("role");
    const faceVerified = localStorage.getItem("faceVerified");

    if (role !== "admin") {
        alert("Адмін-панель доступна тільки адміністратору");
        return;
    }

    if (faceVerified !== "true") {
        alert("Спочатку потрібно пройти біометричну перевірку обличчя");
        return;
    }

    window.location.href = "/admin-panel";
}

function goToResources() {
    const role = localStorage.getItem("role");

    if (!role) {
        alert("Користувач не авторизований");
        window.location.href = "/login-page";
        return;
    }

    window.location.href = "/robotics-resources";
}

function playSuccessSound() {
    const audio = new Audio("/static/sounds/success.mp3");
    audio.volume = 0.7;
    audio.play();
}

function checkAdminAccess() {
    const role = localStorage.getItem("role");
    const faceVerified = localStorage.getItem("faceVerified");

    if (role !== "admin") {
        alert("Доступ дозволено тільки адміністратору");
        window.location.href = "/dashboard";
        return;
    }

    if (faceVerified !== "true") {
        alert("Спочатку потрібно пройти біометричну перевірку");
        window.location.href = "/dashboard";
    }
}

async function loadUsers() {
    const container = document.getElementById("usersList");

    if (!container) return;

    try {
        const response = await fetch("/api/admin/users");
        const users = await response.json();

        if (!response.ok) {
            container.innerHTML = "<p>Помилка завантаження користувачів</p>";
            return;
        }

        let html = `
            <table class="history-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Ім'я</th>
                        <th>Email</th>
                        <th>Роль</th>
                        <th>Дія</th>
                    </tr>
                </thead>
                <tbody>
        `;

        users.forEach(user => {
            html += `
                <tr>
                    <td>${user.id}</td>
                    <td>${user.username}</td>
                    <td>${user.email}</td>
                    <td>
                        <select id="role-${user.id}">
                            <option value="user" ${user.role === "user" ? "selected" : ""}>user</option>
                            <option value="special_user" ${user.role === "special_user" ? "selected" : ""}>special_user</option>
                            <option value="admin" ${user.role === "admin" ? "selected" : ""}>admin</option>
                        </select>
                    </td>
                    <td>
                        <button class="btn" onclick="updateUserRole(${user.id})">
                            Зберегти
                        </button>
                    </td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;

        container.innerHTML = html;

    } catch (error) {
        console.error(error);
        container.innerHTML = "<p>Помилка з'єднання із сервером</p>";
    }
}

async function updateUserRole(userId) {
    const role = document.getElementById(`role-${userId}`).value;

    try {
        const response = await fetch(
            `/api/admin/users/${userId}/role?role=${role}`,
            {
                method: "PUT"
            }
        );

        const data = await response.json();

        alert(data.message || data.detail);

        loadUsers();

    } catch (error) {
        console.error(error);
        alert("Помилка оновлення ролі");
    }
}

async function addResource() {

    const title =
        document.getElementById("resourceTitle").value.trim();

    const description =
        document.getElementById("resourceDescription").value.trim();

    const resourceType =
        document.getElementById("resourceType").value.trim();

    const filePath =
        document.getElementById("resourcePath").value.trim();

    const accessRole =
        document.getElementById("resourceRole").value;

    const accessLevel =
        document.getElementById("resourceAccessLevel").value;

    const categoryId =
        document.getElementById("resourceCategory").value;

    const message =
        document.getElementById("adminMessage");

    if (
        !title ||
        !description ||
        !resourceType ||
        !filePath ||
        !accessRole ||
        !accessLevel ||
        !categoryId
    ) {
        message.innerText =
            "Заповніть усі поля";
        return;
    }

    try {

        const response =
            await fetch(
                "/api/admin/resources",
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json"
                    },
                    body: JSON.stringify({
                        title: title,
                        description: description,
                        resource_type: resourceType,
                        file_path: filePath,
                        access_role: accessRole,
                        access_level: accessLevel,
                        category_id: parseInt(categoryId)
                    })
                }
            );

        const data =
            await response.json();

        if (response.ok) {

            message.innerText =
                data.message;

            document.getElementById(
                "resourceTitle"
            ).value = "";

            document.getElementById(
                "resourceDescription"
            ).value = "";

            document.getElementById(
                "resourceType"
            ).value = "";

            document.getElementById(
                "resourcePath"
            ).value = "";

            document.getElementById(
                "resourceRole"
            ).value = "user";

            document.getElementById(
                "resourceAccessLevel"
            ).value = "public";

            document.getElementById(
                "resourceCategory"
            ).value = "";

            loadAdminResources();

        } else {

            message.innerText =
                data.detail ||
                "Помилка додавання ресурсу";
        }

    } catch (error) {

        console.error(error);

        message.innerText =
            "Помилка з'єднання із сервером";
    }
}

async function loadCategories() {

    const select =
        document.getElementById(
            "resourceCategory"
        );

    if (!select) return;

    try {

        const response =
            await fetch("/api/categories");

        const categories =
            await response.json();

        select.innerHTML =
            '<option value="">Оберіть категорію</option>';

        categories.forEach(category => {

            select.innerHTML += `
                <option value="${category.id}">
                    ${category.name}
                </option>
            `;
        });

    } catch (error) {

        console.error(error);
    }
}

async function loadAdminResources() {
    const container = document.getElementById("adminResourcesList");

    if (!container) return;

    try {
        const response = await fetch("/api/admin/resources");
        const resources = await response.json();

        if (!response.ok) {
            container.innerHTML = "<p>Помилка завантаження ресурсів</p>";
            return;
        }

        if (!resources.length) {
            container.innerHTML = "<p>Ресурси відсутні.</p>";
            return;
        }

        let html = `
            <table class="history-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Назва</th>
                        <th>Тип</th>
                        <th>Категорія</th>
                        <th>Роль доступу</th>
                        <th>Рівень доступу</th>
                        <th>Посилання</th>
                        <th>Дія</th>
                    </tr>
                </thead>
                <tbody>
        `;

        resources.forEach(resource => {
            html += `
                <tr>
                    <td>${resource.id}</td>
                    <td>${resource.title}</td>
                    <td>${resource.resource_type}</td>
                    <td>${resource.category_name || "-"}</td>
                    <td>${resource.access_role || "-"}</td>
                    <td>${resource.access_level || "-"}</td>
                    <td>
                        <a href="${resource.file_path}" target="_blank">
                            Відкрити
                        </a>
                    </td>
                    <td>
                        <button class="logout-btn" onclick="deleteResource(${resource.id})">
                            Видалити
                        </button>
                    </td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;

        container.innerHTML = html;

    } catch (error) {
        console.error(error);
        container.innerHTML = "<p>Помилка з'єднання із сервером</p>";
    }
}

async function deleteResource(resourceId) {
    const confirmed = confirm("Ви дійсно хочете видалити цей ресурс?");

    if (!confirmed) return;

    try {
        const response = await fetch(
            `/api/admin/resources/${resourceId}`,
            {
                method: "DELETE"
            }
        );

        const data = await response.json();

        alert(data.message || data.detail);

        loadAdminResources();

    } catch (error) {
        console.error(error);
        alert("Помилка видалення ресурсу");
    }
}

async function likeResource(resourceId) {
    const userId = localStorage.getItem("userId");

    if (!userId) {
        alert("Користувач не авторизований");
        return;
    }

    try {
        const response = await fetch(
            `/api/resources/${resourceId}/like?user_id=${userId}`,
            {
                method: "POST"
            }
        );

        const data = await response.json();

        if (response.ok) {
            alert(data.message);
            loadResources();
        } else {
            alert(data.detail || "Помилка лайка");
        }

    } catch (error) {
        console.error(error);
        alert("Помилка з'єднання із сервером");
    }
}

async function loadResources() {
    const list = document.getElementById("resourcesList");
    const userId = localStorage.getItem("userId");
    const role = localStorage.getItem("role");
    const faceVerified = localStorage.getItem("faceVerified");

    if (!list) return;

    if (!userId) {
        list.innerHTML = "<p>Користувач не авторизований</p>";
        return;
    }

    if (
        role === "admin" &&
        faceVerified !== "true"
    ) {
        list.innerHTML = `
            <div class="auth-result error">
                ❌ Адміністратор повинен пройти біометричну перевірку
            </div>
        `;
        return;
    }

    try {
        const response = await fetch(`/api/resources/${userId}`);
        const resources = await response.json();

        if (!response.ok) {
            list.innerHTML = "<p>Помилка завантаження ресурсів</p>";
            return;
        }

        if (!resources.length) {
            list.innerHTML = "<p>Доступні ресурси відсутні.</p>";
            return;
        }

        list.innerHTML = "";

        if (
            role === "special_user" &&
            faceVerified !== "true"
        ) {
            list.innerHTML = `
                <div class="auth-result info">
                    ℹ️ Ви бачите тільки загальні ресурси.
                    Для доступу до службових ресурсів пройдіть біометричну перевірку.
                </div>
            `;
        }

        resources.forEach(resource => {
            const card = document.createElement("div");
            card.className = "card";

            card.innerHTML = `
                <h3>${resource.title}</h3>
                <p>${resource.description}</p>

                <p><b>Категорія:</b> ${resource.category_name || "-"}</p>
                <p><b>Тип ресурсу:</b> ${resource.resource_type}</p>
                <p><b>Роль доступу:</b> ${resource.access_role || "-"}</p>
                <p><b>Рівень доступу:</b> ${resource.access_level || "-"}</p>

                <a class="btn" href="${resource.file_path}" target="_blank">
                    Відкрити ресурс
                </a>

                <button class="btn" onclick="likeResource(${resource.id})">
                    ❤️ Вподобати
                </button>
            `;

            list.appendChild(card);
        });

    } catch (error) {
        console.error(error);
        list.innerHTML = "<p>Помилка з'єднання із сервером</p>";
    }
}

function checkFaceVerificationForResources() {
    const role = localStorage.getItem("role");
    const faceVerified = localStorage.getItem("faceVerified");

    const content = document.getElementById("resourcesContent");
    const overlay = document.getElementById("resourceOverlay");

    if (!content || !overlay) return;

    if (role === "user") {
        content.classList.remove("locked");
        overlay.style.display = "none";
        return;
    }

    if (role === "special_user") {
        content.classList.remove("locked");

        if (faceVerified === "true") {
            overlay.style.display = "none";
        } else {
            overlay.style.display = "block";
            overlay.innerHTML = `
                🔒 Для доступу до службових ресурсів необхідно пройти біометричну автентифікацію
                <br><br>
                <button class="btn" onclick="window.location.href='/dashboard'">
                    Перейти до верифікації
                </button>
            `;
        }

        return;
    }

    if (role === "admin") {
        if (faceVerified === "true") {
            content.classList.remove("locked");
            overlay.style.display = "none";
        } else {
            content.classList.add("locked");
            overlay.style.display = "block";
            overlay.innerHTML = `
                🔒 Для доступу необхідно пройти біометричну автентифікацію
                <br><br>
                <button class="btn" onclick="window.location.href='/dashboard'">
                    Перейти до верифікації
                </button>
            `;
        }

        return;
    }

    content.classList.add("locked");
    overlay.style.display = "block";
}


async function loadGitHubRoboticsProjects() {
    await fetchGitHubProjects("robotics ROS AI");
}

async function fetchGitHubProjects(query) {
    const container = document.getElementById("githubProjects");

    if (!container) return;

    container.innerHTML = "<p>Завантаження GitHub-проєктів...</p>";

    try {
        const response = await fetch(
            `/api/github-repositories?query=${encodeURIComponent(query)}`
        );

        const data = await response.json();

        if (!response.ok) {
            container.innerHTML = "<p>Помилка GitHub API</p>";
            return;
        }

        container.innerHTML = "";

        data.forEach(repo => {
            container.innerHTML += `
                <div class="card">
                    <h3>${repo.name}</h3>
                    <p class="repo-description">
                        ${
                            repo.description
                                ? repo.description.length > 160
                                    ? repo.description.substring(0, 160) + "..."
                                    : repo.description
                                : "Опис відсутній"
                        }
                    </p>
                    <p><b>Мова:</b> ${repo.language || "Не вказано"}</p>
                    <p><b>⭐ Stars:</b> ${repo.stars}</p>
                    <p><b>Forks:</b> ${repo.forks}</p>
                    <a class="btn" href="${repo.url}" target="_blank">
                        Відкрити GitHub
                    </a>
                </div>
            `;
        });

    } catch (error) {
        console.error(error);
        container.innerHTML = "<p>Помилка GitHub API</p>";
    }
}

async function searchGitHubProjects() {
    const input = document.getElementById("githubSearchInput");
    const container = document.getElementById("githubProjects");

    if (!input || !container) return;

    const query = input.value.trim();

    if (!query) {
        await loadGitHubRoboticsProjects();
        return;
    }

    await fetchGitHubProjects(query);
}

function checkDashboardAccess() {

    const role = localStorage.getItem("role");

    if (!role) {

        alert("Необхідно увійти в систему");

        window.location.href = "/login-page";

        return;
    }

    if (
        role !== "admin" &&
        role !== "special_user"
    ) {

        alert(
            "Dashboard доступний тільки адміністратору або спец-користувачу"
        );

        window.location.href =
            "/robotics-resources";

        return;
    }
}

async function loadPoseStatus() {
    const userId = localStorage.getItem("userId");
    const faceVerified = localStorage.getItem("faceVerified");
    const frontBtn = document.getElementById("createFrontBtn");

    if (!userId || !frontBtn) return;

    try {
        const response = await fetch(`/api/pose-status?user_id=${userId}`);
        const status = await response.json();

        if (!response.ok) {
            frontBtn.disabled = true;
            frontBtn.innerText = "⚠️ Не вдалося перевірити статус шаблону";
            return;
        }

        localStorage.setItem(
            "hasFrontTemplate",
            status.front ? "true" : "false"
        );

        if (!status.front) {
            frontBtn.disabled = false;
            frontBtn.innerText = "📷 Створити перший біометричний шаблон";
            return;
        }

        if (faceVerified === "true") {
            frontBtn.disabled = false;
            frontBtn.innerText = "📷 Створити новий біометричний шаблон";
            return;
        }

        frontBtn.disabled = true;
        frontBtn.innerText = "🔒 Спочатку пройдіть перевірку обличчя";

    } catch (error) {
        console.error(error);

        frontBtn.disabled = true;
        frontBtn.innerText = "⚠️ Помилка перевірки статусу шаблону";
    }
}

