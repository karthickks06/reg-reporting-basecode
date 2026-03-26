FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --strict-ssl=false

COPY . .

ARG NEXT_PUBLIC_API_BASE=http://localhost:8000
ENV NODE_ENV=production
ENV NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE}

RUN mkdir -p .next/cache && npm run build

EXPOSE 3000

CMD ["npm", "run", "start", "--", "-H", "0.0.0.0", "-p", "3000"]
