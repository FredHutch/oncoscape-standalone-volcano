def js_print(*args, **kwargs):
    msg = ' '.join([str(arg) for arg in args])
    js_log('hi.py', msg)

import sys
class CustomStdout:
  def write(self, msg):
      js_print(msg)
class CustomStderr:
  def write(self, msg):
      js_print(msg)
sys.stdout = CustomStdout()
sys.stderr = CustomStderr()

import pandas as pd
import numpy as np
import io
import time


def some_matrix_math(a: int, b: int) -> pd.DataFrame:
    """Returns a DataFrame with some math done on it."""

    js_print(a, b)
    for i in range(5):
        js_print(i)
        time.sleep(1)
    df = pd.DataFrame(np.random.randint(0, 100, size=(a, b)))
    return df + 1

sys.stdout = io.StringIO()
results_json = some_matrix_math(js_payload.payload_1,js_payload.payload_2).to_json()
results_json

