# Build a Rock Ridge ISO9660 image (mountable by macOS as a .dmg) from an .app bundle.
import os, sys, stat, itertools, pycdlib
src_app, out, vol = sys.argv[1], sys.argv[2], sys.argv[3]
iso = pycdlib.PyCdlib()
iso.new(interchange_level=4, rock_ridge='1.09', vol_ident=vol)
counter = itertools.count()
def nm(): return 'N%06d' % next(counter)
def add_tree(fs_path, iso_parent):
    for name in sorted(os.listdir(fs_path)):
        p = os.path.join(fs_path, name); st = os.lstat(p); ip = iso_parent.rstrip('/') + '/' + nm()
        if stat.S_ISLNK(st.st_mode):
            iso.add_symlink(ip, name, os.readlink(p))
        elif stat.S_ISDIR(st.st_mode):
            iso.add_directory(ip, rr_name=name, file_mode=stat.S_IFDIR | 0o755)
            add_tree(p, ip)
        else:
            iso.add_file(p, ip + ';1', rr_name=name, file_mode=stat.S_IFREG | (0o755 if st.st_mode & 0o111 else 0o644))
appname = os.path.basename(src_app.rstrip('/'))
iso.add_directory('/APP', rr_name=appname, file_mode=stat.S_IFDIR | 0o755)
add_tree(src_app, '/APP')
iso.add_symlink('/APPLINK', 'Applications', '/Applications')
iso.write(out); iso.close()
print('wrote', out)
