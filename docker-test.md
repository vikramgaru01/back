# Test Docker build locally:
docker build -t web2appify-backend .
docker run -p 5000:5000 web2appify-backend
