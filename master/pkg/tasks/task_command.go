package tasks

import (
	"archive/tar"

	"github.com/determined-ai/determined/master/pkg/archive"
	"github.com/determined-ai/determined/master/pkg/container"
	"github.com/determined-ai/determined/master/pkg/etc"
	"github.com/determined-ai/determined/master/pkg/model"
	"github.com/determined-ai/determined/master/pkg/ssh"
)

// CommandSpec is a description of a task for running a command.
type CommandSpec struct {
	Base TaskSpec

	Config          model.CommandConfig
	UserFiles       archive.Archive
	AdditionalFiles archive.Archive
	Metadata        map[string]interface{}
}

// ToTaskSpec generates a TaskSpec.
func (s CommandSpec) ToTaskSpec(keys *ssh.PrivateAndPublicKeys, taskToken string) TaskSpec {
	res := s.Base

	res.TaskToken = taskToken

	if keys != nil {
		s.AdditionalFiles = append(s.AdditionalFiles, archive.Archive{
			res.AgentUserGroup.OwnedArchiveItem(sshDir, nil, sshDirMode, tar.TypeDir),
			res.AgentUserGroup.OwnedArchiveItem(
				shellAuthorizedKeysFile, keys.PublicKey, 0644, tar.TypeReg,
			),
			res.AgentUserGroup.OwnedArchiveItem(
				privKeyFile, keys.PrivateKey, privKeyMode, tar.TypeReg,
			),
			res.AgentUserGroup.OwnedArchiveItem(
				pubKeyFile, keys.PublicKey, pubKeyMode, tar.TypeReg,
			),
			res.AgentUserGroup.OwnedArchiveItem(
				sshdConfigFile,
				etc.MustStaticFile(etc.SSHDConfigResource),
				0644,
				tar.TypeReg,
			),
		}...)
	}

	res.Archives = res.makeArchives([]container.RunArchive{
		wrapArchive(s.Base.AgentUserGroup.OwnArchive(s.UserFiles), ContainerWorkDir),
		wrapArchive(s.AdditionalFiles, rootDir),
	})

	res.Description = "cmd"

	res.Entrypoint = s.Config.Entrypoint

	res.Environment = s.Config.Environment.ToExpconf()

	res.EnvVars = res.makeEnvVars(nil)

	res.Mounts = ToDockerMounts(s.Config.BindMounts.ToExpconf())

	if shm := s.Config.Resources.ShmSize; shm != nil {
		res.ShmSize = int64(*shm)
	}

	res.ResourcesConfig = s.Config.Resources.ToExpconf()

	return res
}
