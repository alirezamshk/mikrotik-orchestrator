from pydantic import BaseModel, Field
from typing import Optional

class GenerateCertRequest(BaseModel):
    cert_name: str = Field(default="server-template", description="Name of the certificate")
    common_name: str = Field(default="server-template", description="Common Name (CN)")
    ca_name: str = Field(default="ca-authority", description="CA Name")
    days_valid: int = Field(default=3650, description="Validity period in days (default: 10 years)")
    key_size: int = Field(default=2048, description="RSA key size (2048 or 4096)")

class UploadCertRequest(BaseModel):
    cert_name: str = Field(default="server-template", description="Name to import as")
    cert_content: str = Field(..., description="PEM content of the certificate (.crt / .pem)")
    key_content: str = Field(..., description="PEM content of the private key (.key)")
    passphrase: Optional[str] = Field(default="", description="Passphrase if encrypted")
