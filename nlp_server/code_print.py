import os

def combine_python_files(root_dir, output_file):
    """
    root_dir 안의 모든 .py 파일을 읽어 하나의 텍스트 파일로 저장한다.
    각 파일 앞에는 상대 경로를 헤더로 기록한다.
    """

    with open(output_file, "w", encoding="utf-8") as outfile:

        for dirpath, dirnames, filenames in os.walk(root_dir):

            # __pycache__ 디렉토리 제외
            dirnames[:] = [d for d in dirnames if d != "__pycache__"]

            for filename in sorted(filenames):
                if filename.endswith(".py") and filename != "__init__.py":

                    full_path = os.path.join(dirpath, filename)

                    # 상대 경로 생성 (예: AA/BB.py)
                    relative_path = os.path.relpath(full_path, root_dir)

                    outfile.write(f"## {relative_path}\n\n")
                    outfile.write("```python\n")

                    with open(full_path, "r", encoding="utf-8") as infile:
                        outfile.write(infile.read())

                    outfile.write("\n```\n\n")


if __name__ == "__main__":

    root_directory = "opsspec/"   # 읽을 폴더
    output_filename = "combined_code.md"  # 출력 파일

    combine_python_files(root_directory, output_filename)

    print(f"Saved to {output_filename}")