"""
SENTINEL — Flask extensions
Uma única instância de cada extensão para toda a aplicação.
"""
from flask_sqlalchemy import SQLAlchemy
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_cors import CORS

db = SQLAlchemy()
limiter = Limiter(key_func=get_remote_address)
cors = CORS()