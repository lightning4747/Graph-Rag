import os
import jwt
from fastapi import Header, HTTPException, status

JWT_SHARED_SECRET = os.environ.get("JWT_SHARED_SECRET")
# Fallback to dev key if not provided
if not JWT_SHARED_SECRET:
    JWT_SHARED_SECRET = "dev_jwt_shared_secret_secure_key_12345"

def get_current_user(authorization: str = Header(...)):
  if not authorization.startswith("Bearer "):
    raise HTTPException(
      status_code=status.HTTP_401_UNAUTHORIZED,
      detail="Invalid Authorization header. Format must be: Bearer <token>"
    )
  
  token = authorization.split(" ")[1]
  
  try:
    payload = jwt.decode(token, JWT_SHARED_SECRET, algorithms=["HS256"])
    user_id = payload.get("user_id")
    role = payload.get("role")
    
    if not user_id or not role:
      raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token is missing required claims (user_id/role)"
      )
      
    return {"user_id": user_id, "role": role}
  except jwt.PyJWTError as e:
    raise HTTPException(
      status_code=status.HTTP_401_UNAUTHORIZED,
      detail=f"Invalid or expired token: {str(e)}"
    )
