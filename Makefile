all: deploy

deploy:
	rsync -e ssh -avrz --delete-after ./* d:~/hub.f-box.org/
#	ssh -t d "cd ~/hub.f-box.org/; kill -9 \`cat .app.pid\`; screen -S hub -p 0 -x stuff 'node server.js\n'"
