import os
import jwt
from fastapi import Header, HTTPException, status

def get_current_user(authorization: str = Header(...)):
  jwt_secret = os.environ.get("JWT_SHARED_SECRET") or "UCTYmi8VSBPQVJyxziCyi8noegzpMgdC+c4jwvJYvsw="

  if not authorization.startswith("Bearer "):
    raise HTTPException(
      status_code=status.HTTP_401_UNAUTHORIZED,
      detail="Invalid Authorization header. Format must be: Bearer <token>"
    )
  
  token = authorization.split(" ")[1]
  
  try:
    payload = jwt.decode(token, jwt_secret, algorithms=["HS256"])
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
