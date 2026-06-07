import os
import uuid
import shutil
import json
import numpy as np

from fastapi import FastAPI, Request, HTTPException
from fastapi import UploadFile, File
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from typing import List
import face_recognition
import requests

from face_model import FaceRecognitionSystem

from fastapi import Depends
from sqlalchemy.orm import Session

from database import engine, get_db
from models import (
    Base,
    User,
    BiometricData,
    Resource,
    AuthenticationLog,
    Category,
    ResourceLike
)
from schemas import RegisterRequest, LoginRequest

from passlib.context import CryptContext


app = FastAPI(title="Biometric Authentication System")

Base.metadata.create_all(bind=engine)

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

templates = Jinja2Templates(
    directory=os.path.join(BASE_DIR, "templates")
)

app.mount(
    "/static",
    StaticFiles(directory=os.path.join(BASE_DIR, "static")),
    name="static"
)

face_system = FaceRecognitionSystem(
    model_path=r"C:\Users\sanda\Documents\dz\ДП\biometric_auth_system\dataset\trained_model\face_svm_model.pkl",
    encoder_path=r"C:\Users\sanda\Documents\dz\ДП\biometric_auth_system\dataset\trained_model\label_encoder.pkl",
    probability_threshold=0.55
)

#users_db = {}


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str


def can_access_resource(user, resource, face_verified=False):

    if user.role == "admin":
        return True

    if resource.access_level == "public":
        return True

    if resource.access_level == "special":
        return (
            user.role == "special_user"
            and face_verified is True
        )

    if resource.access_level == "admin":
        return user.role == "admin"

    return False

@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    return templates.TemplateResponse(request, "index.html")


@app.get("/login-page", response_class=HTMLResponse)
def login_page(request: Request):
    return templates.TemplateResponse(request, "login.html")


@app.get("/register-page", response_class=HTMLResponse)
def register_page(request: Request):
    return templates.TemplateResponse(request, "register.html")


@app.get("/dashboard", response_class=HTMLResponse)
def dashboard(request: Request):
    return templates.TemplateResponse(request, "dashboard.html")


@app.get("/robotics-resources", response_class=HTMLResponse)
def robotics_resources(request: Request):
    return templates.TemplateResponse(request, "resources.html")


'''@app.post("/register")
def register(data: RegisterRequest):
    for user in users_db.values():
        if user["email"] == data.email:
            raise HTTPException(
                status_code=400,
                detail="Користувач з таким email вже існує"
            )

    user_id = str(uuid.uuid4())

    users_db[user_id] = {
        "id": user_id,
        "username": data.username,
        "email": data.email,
        "password": data.password
    }

    return {
        "message": "Користувача успішно зареєстровано",
        "userId": user_id
    }'''

@app.post("/register")
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == data.email).first()

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Користувач з таким email вже існує"
        )

    password_hash = pwd_context.hash(data.password)

    new_user = User(
        username=data.username,
        email=data.email,
        password_hash=password_hash
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {
        "message": "Користувача успішно зареєстровано",
        "userId": new_user.id
    }


@app.post("/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Невірний email або пароль"
        )

    if not pwd_context.verify(data.password, user.password_hash):
        raise HTTPException(
            status_code=401,
            detail="Невірний email або пароль"
        )

    return {
        "message": "Вхід виконано успішно",
        "userId": user.id,
        "username": user.username,
        "role": user.role
    }


@app.post("/authenticate")
async def authenticate(file: UploadFile = File(...)):
    file_path = os.path.join(
        UPLOADS_DIR,
        file.filename
    )

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    result = face_system.authenticate(file_path)

    return result

@app.post("/add-face")
async def add_face(
    user_id: int,
    pose_type: str = "front",
    mode: str = "append",
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    if pose_type != "front":
        raise HTTPException(
            status_code=400,
            detail="Використовується тільки фронтальний біометричний шаблон"
        )

    if mode not in ["append", "replace"]:
        raise HTTPException(
            status_code=400,
            detail="Некоректний режим збереження"
        )

    user = db.query(User).filter(
        User.id == user_id
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="Користувача не знайдено"
        )

    embeddings = []

    for index, file in enumerate(files):
        file_path = os.path.join(
            UPLOADS_DIR,
            f"user_{user_id}_front_{uuid.uuid4().hex}.jpg"
        )

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        image = face_recognition.load_image_file(file_path)

        encodings = face_recognition.face_encodings(
            image,
            num_jitters=2,
            model="small"
        )

        if len(encodings) == 1:
            embeddings.append(encodings[0])

    if len(embeddings) == 0:
        raise HTTPException(
            status_code=400,
            detail="Не вдалося знайти обличчя. Дивіться прямо в камеру"
        )

    mean_embedding = np.mean(
        embeddings,
        axis=0
    )

    old_templates = db.query(BiometricData).filter(
        BiometricData.user_id == user_id,
        BiometricData.pose_type == "front"
    ).all()

    if mode == "replace" or len(old_templates) == 0:
        for template in old_templates:
            db.delete(template)

        db.flush()

    new_template = BiometricData(
        user_id=user_id,
        pose_type="front",
        face_embedding=json.dumps(
            mean_embedding.tolist()
        ),
        image_path=None
    )

    db.add(new_template)
    db.commit()
    db.refresh(new_template)

    return {
        "message": "Біометричний шаблон створено",
        "template_id": int(new_template.id),
        "pose_type": "front",
        "mode": mode,
        "photos_processed": int(len(embeddings))
    }

@app.get("/api/resources/{user_id}")
def get_resources(
    user_id: int,
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(
        User.id == user_id
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="Користувача не знайдено"
        )

    all_resources = db.query(Resource).all()

    resources = []

    for resource in all_resources:

        if can_access_resource(
            user,
            resource,
            user.face_verified
        ):
            resources.append(resource)

    return [
        {
            "id": resource.id,
            "title": resource.title,
            "description": resource.description,
            "resource_type": resource.resource_type,
            "file_path": resource.file_path,
            "access_role": resource.access_role,
            "access_level": resource.access_level,
            "category_id": resource.category_id,
            "category_name": (
                resource.category.name
                if resource.category else None
            ),
            "likes_count": len(resource.likes)
        }
        for resource in resources
    ]

@app.get("/api/auth-history/{user_id}")
def get_auth_history(
    user_id: int,
    db: Session = Depends(get_db)
):
    logs = db.query(AuthenticationLog).filter(
        AuthenticationLog.user_id == user_id
    ).order_by(
        AuthenticationLog.created_at.desc()
    ).limit(10).all()

    return [
        {
            "id": log.id,
            "auth_result": log.auth_result,
            "similarity_score": log.similarity_score,
            "ip_address": log.ip_address,
            "created_at": str(log.created_at)
        }
        for log in logs
    ]

@app.get("/admin-panel", response_class=HTMLResponse)
def admin_panel(request: Request):
    return templates.TemplateResponse(request, "admin.html")

@app.get("/api/categories")
def get_categories(
    db: Session = Depends(get_db)
):
    categories = db.query(Category).all()

    return [
        {
            "id": c.id,
            "name": c.name
        }
        for c in categories
    ]

class ResourceCreateRequest(BaseModel):
    title: str
    description: str
    resource_type: str
    file_path: str
    access_role: str
    access_level: str
    category_id: int

@app.get("/api/admin/users")
def get_all_users(db: Session = Depends(get_db)):
    users = db.query(User).all()

    return [
        {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "created_at": str(user.created_at)
        }
        for user in users
    ]


@app.put("/api/admin/users/{user_id}/role")
def update_user_role(
    user_id: int,
    role: str,
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="Користувача не знайдено"
        )

    if role not in ["user","special_user","admin"]:
        raise HTTPException(
            status_code=400,
            detail="Некоректна роль"
        )

    user.role = role
    db.commit()

    return {
        "message": "Роль користувача оновлено"
    }


@app.post("/api/admin/resources")
def create_resource(
    data: ResourceCreateRequest,
    db: Session = Depends(get_db)
):
    new_resource = Resource(
        title=data.title,
        description=data.description,
        resource_type=data.resource_type,
        file_path=data.file_path,
        access_role=data.access_role,
        access_level=data.access_level,
        category_id=data.category_id
    )

    db.add(new_resource)
    db.commit()
    db.refresh(new_resource)

    return {
        "message": "Ресурс успішно додано",
        "resource_id": new_resource.id,
        "access_role": new_resource.access_role,
        "access_level": new_resource.access_level
    }

@app.get("/api/admin/resources")
def get_all_admin_resources(
    db: Session = Depends(get_db)
):
    resources = db.query(Resource).all()

    return [
        {
            "id": resource.id,
            "title": resource.title,
            "description": resource.description,
            "resource_type": resource.resource_type,
            "file_path": resource.file_path,
            "access_role": resource.access_role,
            "access_level": resource.access_level,
            "category_id": resource.category_id,
            "category_name": (
                resource.category.name
                if resource.category else None
            )
        }
        for resource in resources
    ]

@app.delete("/api/admin/resources/{resource_id}")
def delete_resource(
    resource_id: int,
    db: Session = Depends(get_db)
):
    resource = db.query(Resource).filter(
        Resource.id == resource_id
    ).first()

    if not resource:
        raise HTTPException(
            status_code=404,
            detail="Ресурс не знайдено"
        )

    db.delete(resource)
    db.commit()

    return {
        "message": "Ресурс успішно видалено"
    }

@app.get("/api/github-repositories")
def get_github_repositories(
    query: str = "robotics ROS AI"
):

    github_url = (
        "https://api.github.com/search/repositories"
    )

    params = {
        "q": query,
        "sort": "stars",
        "order": "desc",
        "per_page": 6
    }

    response = requests.get(
        github_url,
        params=params
    )

    if response.status_code != 200:
        raise HTTPException(
            status_code=500,
            detail="GitHub API error"
        )

    data = response.json()

    repositories = []

    for repo in data.get("items", []):

        repositories.append({
            "name": repo["full_name"],
            "description": repo["description"],
            "language": repo["language"],
            "stars": repo["stargazers_count"],
            "forks": repo["forks_count"],
            "url": repo["html_url"]
        })

    return repositories

@app.post("/authenticate-user-multiframe")
async def authenticate_user_multiframe(
    user_id: int,
    pose_type: str = "front",
    files: List[UploadFile] = File(...),
    request: Request = None,
    db: Session = Depends(get_db)
):
    if pose_type not in ["front", "left", "right"]:
        raise HTTPException(
            status_code=400,
            detail="Некоректний тип пози"
        )

    biometric_templates = db.query(BiometricData).filter(
        BiometricData.user_id == user_id,
        BiometricData.pose_type == pose_type
    ).all()

    if not biometric_templates:
        raise HTTPException(
            status_code=404,
            detail=f"Шаблон для пози {pose_type} ще не створено"
        )

    embeddings = []

    for index, file in enumerate(files):
        file_path = os.path.join(
            UPLOADS_DIR,
            f"auth_{user_id}_{pose_type}_{uuid.uuid4().hex}.jpg"
        )

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        image = face_recognition.load_image_file(file_path)
        encodings = face_recognition.face_encodings(image)

        if len(encodings) == 1:
            embeddings.append(encodings[0])

    if len(embeddings) == 0:
        raise HTTPException(
            status_code=400,
            detail=f"Не вдалося знайти обличчя для перевірки пози {pose_type}"
        )

    mean_unknown_embedding = np.mean(
        embeddings,
        axis=0
    )

    distances = []

    for template in biometric_templates:
        known_embedding = np.array(
            json.loads(template.face_embedding)
        )

        template_distance = np.linalg.norm(
            known_embedding - mean_unknown_embedding
        )

        distances.append(
            {
                "template_id": int(template.id),
                "distance": float(template_distance)
            }
        )

    best_match = min(
        distances,
        key=lambda item: item["distance"]
    )

    distance = float(best_match["distance"])
    best_template_id = int(best_match["template_id"])

    tolerance_by_pose = {
        "front": 0.50,
        "left": 0.58,
        "right": 0.58
    }

    tolerance = float(tolerance_by_pose[pose_type])

    confidence = round(
        max(0, (1 - distance)) * 100,
        2
    )

    success = bool(distance <= tolerance)

    log = AuthenticationLog(
        user_id=user_id,
        auth_result=(
            f"success_{pose_type}"
            if success
            else f"failed_{pose_type}"
        ),
        similarity_score=float(distance),
        ip_address=request.client.host if request else None
    )

    db.add(log)
    db.commit()

    if success:
        user = db.query(User).filter(
            User.id == user_id
        ).first()

        if user:
            user.face_verified = True
            db.commit()

    return {
        "success": bool(success),
        "pose_type": str(pose_type),
        "message": (
            "Обличчя підтверджено"
            if success
            else "Обличчя не підтверджено"
        ),
        "best_template_id": best_template_id,
        "distance": float(distance),
        "confidence": float(confidence),
        "frames_used": int(len(embeddings)),
        "templates_checked": int(len(biometric_templates)),
        "tolerance": float(tolerance)
    }

@app.get("/api/biometric-status")
def biometric_status(
    user_id: int,
    db: Session = Depends(get_db)
):

    count = db.query(BiometricData).filter(
        BiometricData.user_id == user_id
    ).count()

    return {
        "biometric_ready": count >= 3
    }

@app.post("/api/resources/{resource_id}/like")
def like_resource(
    resource_id: int,
    user_id: int,
    db: Session = Depends(get_db)
):
    existing = db.query(ResourceLike).filter(
        ResourceLike.user_id == user_id,
        ResourceLike.resource_id == resource_id
    ).first()

    if existing:
        db.delete(existing)
        db.commit()

        return {
            "liked": False,
            "message": "Лайк видалено"
        }

    like = ResourceLike(
        user_id=user_id,
        resource_id=resource_id
    )

    db.add(like)
    db.commit()

    return {
        "liked": True,
        "message": "Лайк додано"
    }

@app.get("/api/pose-status")
def pose_status(
    user_id: int,
    db: Session = Depends(get_db)
):

    poses = db.query(
        BiometricData.pose_type
    ).filter(
        BiometricData.user_id == user_id
    ).all()

    existing = [p[0] for p in poses]

    return {
        "front": "front" in existing,
        "left": "left" in existing,
        "right": "right" in existing
    }