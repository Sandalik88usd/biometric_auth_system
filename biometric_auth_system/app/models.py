from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Float,
    ForeignKey,
    Text,
    Boolean
)

from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from database import Base
from datetime import datetime

created_at = Column(
    DateTime,
    default=datetime.utcnow
)

class User(Base):
    __tablename__ = "Users"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    username = Column(
        String(100),
        unique=True,
        nullable=False
    )

    email = Column(
        String(255),
        unique=True,
        nullable=False
    )

    password_hash = Column(
        String(255),
        nullable=False
    )

    role = Column(
        String(50),
        default="user"
    )

    face_verified = Column(
        Boolean,
        default=False,
        nullable=False
    )

    created_at = Column(
        DateTime,
        server_default=func.now()
    )

    biometric_data = relationship(
        "BiometricData",
        back_populates="user",
        cascade="all, delete"
    )

    resource_likes = relationship(
        "ResourceLike",
        back_populates="user",
        cascade="all, delete"
    )

    


class BiometricData(Base):
    __tablename__ = "BiometricData"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("Users.id")
    )

    pose_type = Column(
        String(50),
        nullable=False,
        default="front"
    )

    face_embedding = Column(Text)

    image_path = Column(String)

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )

    user = relationship(
        "User",
        back_populates="biometric_data"
    )


class AuthenticationLog(Base):
    __tablename__ = "AuthenticationLogs"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey(
            "Users.id",
            ondelete="SET NULL"
        ),
        nullable=True
    )

    auth_result = Column(
        String(50),
        nullable=False
    )

    similarity_score = Column(Float)

    ip_address = Column(String(50))

    created_at = Column(
        DateTime,
        server_default=func.now()
    )


class AccessToken(Base):
    __tablename__ = "AccessTokens"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey(
            "Users.id",
            ondelete="CASCADE"
        )
    )

    token = Column(
        Text,
        nullable=False
    )

    expires_at = Column(
        DateTime,
        nullable=False
    )

    created_at = Column(
        DateTime,
        server_default=func.now()
    )


class Category(Base):
    __tablename__ = "Categories"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(
        String(100),
        nullable=False,
        unique=True
    )

    resources = relationship(
        "Resource",
        back_populates="category"
    )


class Resource(Base):
    __tablename__ = "Resources"

    id = Column(Integer, primary_key=True, index=True)

    title = Column(
        String(255),
        nullable=False
    )

    access_role = Column(
        String(50),
        default="user"
    )

    access_level = Column(
        String(50),
        default="public"
    )

    description = Column(Text)

    resource_type = Column(String(100))

    file_path = Column(String(500))

    category_id = Column(
        Integer,
        ForeignKey("Categories.id"),
        nullable=True
    )

    created_at = Column(
        DateTime,
        server_default=func.now()
    )

    category = relationship(
        "Category",
        back_populates="resources"
    )

    likes = relationship(
        "ResourceLike",
        back_populates="resource",
        cascade="all, delete"
    )

class ResourceLike(Base):
    __tablename__ = "ResourceLikes"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("Users.id"),
        nullable=False
    )

    resource_id = Column(
        Integer,
        ForeignKey("Resources.id"),
        nullable=False
    )

    created_at = Column(
        DateTime,
        server_default=func.now()
    )

    user = relationship(
        "User",
        back_populates="resource_likes"
    )

    resource = relationship(
        "Resource",
        back_populates="likes"
    )

class SystemLog(Base):
    __tablename__ = "SystemLogs"

    id = Column(Integer, primary_key=True, index=True)

    log_level = Column(
        String(50),
        nullable=False
    )

    message = Column(
        Text,
        nullable=False
    )

    module = Column(String(100))

    created_at = Column(
        DateTime,
        server_default=func.now()
    )