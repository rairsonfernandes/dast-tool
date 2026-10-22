# backend/tenants/service.py
# TODO: Implementar a lógica de serviço de tenants (multi-tenancy).

def get_tenant(tenant_id: str):
    from models import Tenant
    from extensions import db
    return db.session.get(Tenant, tenant_id)
