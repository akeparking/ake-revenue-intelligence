FROM postgres:17-alpine
RUN apk add --no-cache aws-cli tzdata
COPY deploy/backup/backup.sh /usr/local/bin/backup-revenue
RUN chmod 0755 /usr/local/bin/backup-revenue
ENTRYPOINT ["/usr/local/bin/backup-revenue"]
