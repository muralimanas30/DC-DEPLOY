graph TD
User["Victim / Volunteer / Admin"]

    User -->|HTTPS| NextJS["Next.js Web App"]

    NextJS -->|NextAuth| Auth["Auth Layer"]
    NextJS -->|API Calls| Backend["Node.js Backend API"]

    Backend --> AuthModule["Auth Module"]
    Backend --> UserModule["User Management"]
    Backend --> DisasterModule["Disaster Management"]

    DisasterModule --> EmailService["Email Service (Nodemailer / 3rd Party)"]

    AuthModule --> DB["MongoDB"]
    UserModule --> DB
    DisasterModule --> DB

    NextJS --> Leaflet["Leaflet Maps (Frontend)"]
