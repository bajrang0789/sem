gcloud config set project bajrang-444504
gcloud auth configure-docker
gcloud config set run/region us-central1
docker build -t us-central1-docker.pkg.dev/bajrang-444504/sme/smart-expense-manager:latest .
docker push us-central1-docker.pkg.dev/bajrang-444504/sme/smart-expense-manager:latest
gcloud run deploy smart-expense-manager \
    --image us-central1-docker.pkg.dev/bajrang-444504/sme/smart-expense-manager:latest \
    --platform managed \
    --region us-central1 \
    --allow-unauthenticated

# DO NOT PUSH THIS CODE 
gcloud run services update smart-expense-manager \
    --update-env-vars GEMINI_API_KEY='xxxxx',BUCKET_NAME='sem-gcp-demo'
