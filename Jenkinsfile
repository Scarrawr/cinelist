// CineList CI/CD pipeline (declarative, pipeline as code)
// Checkout -> Test -> Build Images -> Deploy -> Smoke Test
pipeline {
  agent any

  environment {
    COMPOSE_PROJECT_NAME = 'cinelist'
    // Every image is tagged with the build number => any old build can be redeployed (rollback)
    TAG = "${env.BUILD_NUMBER}"
  }

  triggers {
    githubPush()                 // instant: GitHub webhook -> Jenkins (see README)
    pollSCM('H/2 * * * *')       // fallback: check the repo every ~2 minutes
  }

  options {
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '15'))
  }

  stages {
    stage('Checkout') {
      steps { checkout scm }
    }

    stage('Test') {
      steps {
        // Runs the "test" stage of each Dockerfile. If any test fails, the build fails
        // HERE, so Build/Deploy never run and the live app keeps its previous version.
        sh 'docker build --target test -t cinelist/auth-service:test ./auth-service'
        sh 'docker build --target test -t cinelist/movies-api:test ./movies-api'
      }
    }

    stage('Build Images') {
      steps {
        withCredentials([file(credentialsId: 'cinelist-env', variable: 'ENV_FILE')]) {
          sh 'cp "$ENV_FILE" .env'
          sh 'docker compose build'
        }
      }
    }

    stage('Deploy') {
      steps {
        withCredentials([file(credentialsId: 'cinelist-env', variable: 'ENV_FILE')]) {
          sh 'cp "$ENV_FILE" .env'
          sh 'docker compose up -d --no-build --remove-orphans'
        }
      }
    }

    stage('Smoke Test') {
      steps {
        sh '''
          for i in $(seq 1 24); do
            if docker compose exec -T proxy wget -qO- http://localhost:8080/health/auth >/dev/null \
            && docker compose exec -T proxy wget -qO- http://localhost:8080/health/movies >/dev/null \
            && docker compose exec -T proxy wget -qO- http://localhost:8080/login.html >/dev/null \
            && docker compose exec -T frontend wget -qO- http://localhost:8080/index.html | grep -q "buildLabel\\">${TAG}<"; then
              echo "Smoke test passed: build ${TAG} is live"
              exit 0
            fi
            echo "Waiting for services... ($i/24)"
            sleep 5
          done
          echo "Smoke test FAILED"
          docker compose ps
          exit 1
        '''
      }
    }
  }

  post {
    success {
      echo "CineList build ${TAG} is live at http://localhost:8080"
    }
    failure {
      echo "Build ${TAG} failed. Check the stage logs. To roll back run the cinelist-rollback job with a previous build number, or: TAG=<previous> docker compose up -d --no-build"
    }
    always {
      sh 'rm -f .env'                    // never leave secrets in the workspace
      sh 'docker image prune -f || true' // remove dangling layers (tagged builds are kept for rollback)
    }
  }
}
