from flask import Flask, send_from_directory
import os
app = Flask(__name__)
app.config['SECRET_KEY'] = "57dwad86a465d79"

@app.route('/')
def hello_world():
    return 'Hello, World!'


@app.route('/favicon.ico')
def favicon():
    return send_from_directory(os.path.join(app.root_path, 'static'),
                          'favicon.ico',mimetype='image/vnd.microsoft.icon')
