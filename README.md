Biometric Authentication System for Robotic Information Resources
Система біометричної автентифікації для доступу до інформаційних ресурсів робототехнічних систем
🇺🇦 Українська версія
Опис проєкту

Система призначена для автентифікації користувачів за допомогою біометричного розпізнавання обличчя та контролю доступу до інформаційних ресурсів робототехнічного спрямування.

Проєкт реалізований як вебзастосунок на основі клієнт-серверної архітектури та забезпечує захищений доступ до матеріалів, пов'язаних із робототехнікою, комп'ютерним зором, безпілотними літальними апаратами (БПЛА), наземними роботизованими комплексами (НРК) та іншими засобами роботизації.

Основні можливості
Реєстрація користувачів
Авторизація за логіном та паролем
Створення біометричного шаблону обличчя
Біометрична автентифікація користувача
Перевірка живої присутності (Liveness Detection)
Рольова модель доступу
Адміністративна панель
Інформаційні ресурси з робототехніки
Автоматичне отримання актуальних GitHub-репозиторіїв
Пошук ресурсів за ключовими словами
Система вподобань (Like System)
Ролі користувачів
User

Має доступ до загальнодоступних інформаційних ресурсів.

Special User

Після успішної біометричної верифікації отримує доступ до службових матеріалів, що містять інформацію про:

БПЛА
НРК
робототехнічні системи
технічну документацію
результати досліджень

Не має доступу до адміністративної панелі.

Admin

Має повний доступ до системи.

Додатково проходить:

перевірку живої присутності;
біометричну автентифікацію.

Може:

керувати користувачами;
керувати ресурсами;
переглядати журнали системи.
Використані технології
Backend
Python
FastAPI
SQLAlchemy
Uvicorn
OpenCV
face_recognition
Dlib
NumPy
MediaPipe
Frontend
HTML5
CSS3
JavaScript
WebRTC
Fetch API
Database
Microsoft SQL Server
Запуск проєкту
Створити та активувати віртуальне середовище:
python -m venv venv
venv\Scripts\activate
Встановити залежності:
pip install -r requirements.txt
Налаштувати підключення до MSSQL у файлі конфігурації.
Запустити сервер:
uvicorn app:app --reload

або

python app.py
Відкрити браузер:
http://localhost:8000
Автор

Сергій Окара

🇬🇧 English Version
Project Description

The system is designed for user authentication based on biometric face recognition and secure access control to robotic information resources.

The project is implemented as a web application using a client-server architecture and provides protected access to resources related to robotics, computer vision, unmanned aerial vehicles (UAVs), unmanned ground vehicles (UGVs), and other robotic systems.

Main Features
User registration
Login and password authentication
Face biometric template creation
Biometric user authentication
Liveness Detection
Role-based access control
Administration panel
Robotics information resources
Automatic GitHub repository retrieval
Resource search functionality
Like system
User Roles
User

Has access to public information resources.

Special User

After successful biometric verification gains access to restricted resources related to:

UAVs
UGVs
robotic systems
technical documentation
research materials

Does not have access to the administration panel.

Admin

Has full system access.

Additionally performs:

liveness verification;
biometric authentication.

Can:

manage users;
manage resources;
view system logs.
Technologies Used
Backend
Python
FastAPI
SQLAlchemy
Uvicorn
OpenCV
face_recognition
Dlib
NumPy
MediaPipe
Frontend
HTML5
CSS3
JavaScript
WebRTC
Fetch API
Database
Microsoft SQL Server
Running the Project
Create and activate a virtual environment:
python -m venv venv
venv\Scripts\activate
Install dependencies:
pip install -r requirements.txt
Configure MSSQL database connection.
Start the server:
uvicorn app:app --reload

or

python app.py
Open:
http://localhost:8000
Author

Serhii Okara
