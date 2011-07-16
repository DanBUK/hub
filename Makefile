all: deploy

deploy:
	rsync -e ssh -avrz --delete-after ./* d:~/hub.f-box.org/
