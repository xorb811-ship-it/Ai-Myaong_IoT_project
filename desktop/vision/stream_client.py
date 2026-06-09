class MjpegStreamClient:
    def __init__(self, stream_url: str) -> None:
        self.stream_url = stream_url

    def open(self) -> None:
        raise NotImplementedError(
            "Implement the MJPEG frame loop here with requests/OpenCV decoding."
        )
