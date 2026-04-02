FROM node:18-alpine

# O Hugging Face exige que o container rode sem privilégios de root (User ID 1000)
RUN adduser -D -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR $HOME/app

# Copia os arquivos de dependência e instala
COPY --chown=user server/package*.json ./
RUN npm install --production

# Copia o resto do código da pasta server (incluindo firebase-key.json)
COPY --chown=user server/ ./

# O Hugging Face sempre direciona o tráfego externo para a porta 7860 internamente
ENV PORT=7860
EXPOSE 7860

# Inicia o backend
CMD ["node", "index.js"]
